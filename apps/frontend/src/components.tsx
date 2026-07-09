import { FormEvent, ReactNode, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createProject, createRun, getRun, listProjects } from "./api";
import {
  artifactEvents,
  artifactStorageKey,
  artifactType,
  diagnosisFromEvents,
  latestPersistedDiagnosis,
  projectLocalPath,
  retrievalMatches,
  runTargetUrl,
  runTaskGoal,
} from "./eventSelectors";
import { useWorkspaceStore } from "./store";
import { Artifact, DiagnosisReport, Project, Run, RunEvent, SseStatus } from "./types";
import { useRunEvents } from "./useRunEvents";

const agentStyles: Record<string, string> = {
  browser: "border-l-sky-500 bg-sky-50",
  indexer: "border-l-emerald-600 bg-emerald-50",
  retrieval: "border-l-violet-600 bg-violet-50",
  diagnosis: "border-l-amber-600 bg-amber-50",
  verifier: "border-l-rose-600 bg-rose-50",
  run: "border-l-slate-500 bg-slate-50",
};

export function DashboardPage({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const queryClient = useQueryClient();
  const { selectProject, setSelectedProjectId } = useWorkspaceStore();
  const [name, setName] = useState("UI Sentinel Demo");
  const [localPath, setLocalPath] = useState("apps/demo-react-app");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      selectProject(project);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createMutation.mutate({
      name,
      local_path: localPath,
    });
  }

  return (
    <section className="space-y-5">
      <Panel>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="section-kicker">Dashboard</p>
            <h2 className="section-title">Projects</h2>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
            <Field label="Name">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Local path">
              <input value={localPath} onChange={(event) => setLocalPath(event.target.value)} />
            </Field>
            <button className="primary-action self-end" type="submit">
              Create
            </button>
          </form>
        </div>
        {createMutation.error ? <ErrorText error={createMutation.error} /> : null}
      </Panel>

      <div className="grid gap-3">
        {projectsQuery.isLoading ? <Panel>Loading projects...</Panel> : null}
        {projectsQuery.error ? <Panel><ErrorText error={projectsQuery.error} /></Panel> : null}
        {projectsQuery.data?.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            onOpen={() => {
              setSelectedProjectId(project.id);
              onOpenWorkspace();
            }}
          />
        ))}
        {projectsQuery.data?.length === 0 ? <Panel>No projects found.</Panel> : null}
      </div>
    </section>
  );
}

function ProjectRow({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <Panel>
      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-ink">{project.name}</h3>
          <p className="truncate text-sm text-muted">{project.id}</p>
          <p className="mt-1 text-sm text-ink">{projectLocalPath(project)}</p>
        </div>
        <button className="secondary-action" type="button" onClick={onOpen}>
          Create Run
        </button>
      </div>
    </Panel>
  );
}

export function RunWorkspacePage() {
  const queryClient = useQueryClient();
  const {
    selectedProjectId,
    selectedRunId,
    currentRun,
    setSelectedProjectId,
    setSelectedRunId,
    setCurrentRun,
  } = useWorkspaceStore();
  const [targetUrl, setTargetUrl] = useState("http://127.0.0.1:5273/");
  const [taskGoal, setTaskGoal] = useState(
    "Diagnose why empty login submit shows password required but not email required.",
  );

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const runQuery = useQuery({
    queryKey: ["run", selectedRunId],
    queryFn: () => getRun(selectedRunId),
    enabled: Boolean(selectedRunId),
  });

  const run = runQuery.data ?? currentRun;
  const runEvents = useRunEvents(selectedRunId);

  const createRunMutation = useMutation({
    mutationFn: createRun,
    onSuccess: (created) => {
      setCurrentRun(created);
      setSelectedRunId(created.id);
      void queryClient.invalidateQueries({ queryKey: ["run", created.id] });
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }
    createRunMutation.mutate({
      project_id: selectedProjectId,
      target_url: targetUrl,
      task_goal: taskGoal,
    });
  }

  return (
    <section className="space-y-5">
      <Panel>
        <form className="grid gap-4 xl:grid-cols-[240px_1fr_1.4fr_auto_auto]" onSubmit={submit}>
          <Field label="Project">
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
            >
              <option value="">Select project</option>
              {projectsQuery.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target URL">
            <input value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
          </Field>
          <Field label="Task goal">
            <input value={taskGoal} onChange={(event) => setTaskGoal(event.target.value)} />
          </Field>
          <button className="primary-action self-end" type="submit" disabled={!selectedProjectId}>
            Start Run
          </button>
          <StatusBadge run={run} sseStatus={runEvents.status} />
        </form>
        {createRunMutation.error ? <ErrorText error={createRunMutation.error} /> : null}
      </Panel>

      <div className="workspace-grid">
        <TimelinePanel events={runEvents.events} status={runEvents.status} error={runEvents.error} onReconnect={runEvents.reconnect} />
        <EvidencePanel run={run} events={runEvents.events} />
        <RagPanel events={runEvents.events} />
      </div>

      <DiagnosisPanel run={run} events={runEvents.events} />
    </section>
  );
}

function TimelinePanel({
  events,
  status,
  error,
  onReconnect,
}: {
  events: RunEvent[];
  status: SseStatus;
  error: string;
  onReconnect: () => void;
}) {
  return (
    <Panel className="min-h-[560px]">
      <PanelHeader title="Agent Timeline" meta={`${events.length} events`} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <SseBadge status={status} />
        <button className="small-action" type="button" onClick={onReconnect}>
          Reconnect
        </button>
      </div>
      {error ? <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">{error}</p> : null}
      <div className="space-y-3">
        {events.map((event) => (
          <EventCard key={event.event_id} event={event} />
        ))}
        {events.length === 0 ? <EmptyState text="Select or create a run to load events." /> : null}
      </div>
    </Panel>
  );
}

function EventCard({ event }: { event: RunEvent }) {
  const style = agentStyles[event.agent] ?? agentStyles.run;
  return (
    <article className={`rounded-md border border-line border-l-4 p-3 ${style}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{event.type}</p>
          <p className="text-xs uppercase text-muted">{event.agent || "run"} · {event.status}</p>
        </div>
        <time className="shrink-0 text-xs text-muted">{formatTime(event.timestamp)}</time>
      </div>
      <pre className="event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
    </article>
  );
}

function EvidencePanel({ run, events }: { run: Run | null; events: RunEvent[] }) {
  const [tab, setTab] = useState("Screenshots");
  const eventArtifacts = artifactEvents(events);
  const persistedArtifacts = run?.artifacts ?? [];
  const filteredEvents = eventArtifacts.filter((event) => tabMatchesEvent(tab, event));
  const filteredArtifacts = persistedArtifacts.filter((artifact) => tabMatchesArtifact(tab, artifact));

  return (
    <Panel className="min-h-[560px]">
      <PanelHeader title="Browser Evidence" meta={runTargetUrl(run) || "No target URL"} />
      <Tabs tabs={["Screenshots", "DOM", "Console", "Network"]} active={tab} onChange={setTab} />
      <div className="space-y-3">
        {filteredArtifacts.map((artifact, index) => (
          <ArtifactCard key={artifact.id ?? `${artifactStorageKey(artifact)}-${index}`} artifact={artifact} />
        ))}
        {filteredEvents.map((event) => (
          <EventArtifactCard key={event.event_id} event={event} />
        ))}
        {filteredArtifacts.length === 0 && filteredEvents.length === 0 ? (
          <EmptyState text="No evidence for this tab yet. Artifact serving is not required for this task; storage keys and payloads will appear here when events arrive." />
        ) : null}
      </div>
    </Panel>
  );
}

function RagPanel({ events }: { events: RunEvent[] }) {
  const matches = retrievalMatches(events);
  return (
    <Panel className="min-h-[560px]">
      <PanelHeader title="Code RAG" meta={`${matches.length} matches`} />
      <div className="space-y-3">
        {matches.map((match) => (
          <article key={match.chunk_id} className="rounded-md border border-line bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{match.file_path}</p>
                <p className="text-xs text-muted">
                  {match.chunk_type ?? "chunk"} · {match.symbol_name ?? "symbol"} · lines {match.start_line}-{match.end_line}
                </p>
              </div>
              <span className="score-badge">{formatScore(match.final_score)}</span>
            </div>
            {match.content ? <pre className="code-snippet">{match.content}</pre> : null}
          </article>
        ))}
        {matches.length === 0 ? <MockFallback label="Code RAG" text="No retrieval event is available yet. Run Task 7 or Task 8 validation to populate rag.retrieved events." /> : null}
      </div>
    </Panel>
  );
}

function DiagnosisPanel({ run, events }: { run: Run | null; events: RunEvent[] }) {
  const eventReport = diagnosisFromEvents(events);
  const persisted = latestPersistedDiagnosis(run);
  const report = eventReport ?? persisted;

  return (
    <Panel>
      <PanelHeader title="Diagnosis Report" meta={runTaskGoal(run) || "No run selected"} />
      {report ? <DiagnosisReportView report={report} /> : <MockFallback label="Diagnosis" text="No diagnosis report is available yet. This development-only fallback keeps the workspace usable until Task 8 output exists for the selected run." />}
    </Panel>
  );
}

function DiagnosisReportView({ report }: { report: DiagnosisReport }) {
  const fixSuggestions = report.fix_suggestions ?? report.fixSuggestions ?? [];
  const verifier = report.verifier_result ?? report.verifierResult;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-3">
        <div>
          <p className="text-sm uppercase text-muted">Summary</p>
          <p className="text-base font-semibold text-ink">{report.summary}</p>
        </div>
        <span className="severity-badge">{report.severity}</span>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Claims</p>
          {report.claims.map((claim, index) => (
            <div key={`${claim.text}-${index}`} className="rounded-md border border-line bg-slate-50 p-3">
              <p className="text-sm text-ink">{claim.text}</p>
              <p className="mt-2 break-all text-xs text-muted">Evidence: {claim.evidence_ids.join(", ")}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <div className="rounded-md border border-line bg-slate-50 p-3">
          <p className="text-sm font-semibold text-ink">Verifier</p>
          <p className="text-sm text-muted">Verified: {String(verifier?.verified ?? false)}</p>
          <p className="text-sm text-muted">Unsupported: {verifier?.unsupported_claims?.join(", ") || "none"}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">Fix Suggestions</p>
          {fixSuggestions.map((suggestion, index) => (
            <div key={`${suggestion.file_path}-${index}`} className="rounded-md border border-line bg-slate-50 p-3">
              <p className="text-sm font-semibold text-ink">{suggestion.file_path}</p>
              <p className="text-sm text-muted">{suggestion.suggestion}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-line bg-panel p-4 shadow-sm ${className}`}>{children}</div>;
}

function PanelHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {meta ? <p className="min-w-0 truncate text-sm text-muted">{meta}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}) {
  return (
    <div className="mb-4 grid grid-cols-4 rounded-md border border-line bg-slate-100 p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`tab-button ${active === tab ? "tab-button-active" : ""}`}
          type="button"
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  return (
    <article className="rounded-md border border-line bg-slate-50 p-3">
      <p className="text-sm font-semibold text-ink">{artifactType(artifact)}</p>
      <p className="break-all text-sm text-muted">{artifactStorageKey(artifact)}</p>
    </article>
  );
}

function EventArtifactCard({ event }: { event: RunEvent }) {
  return (
    <article className="rounded-md border border-line bg-slate-50 p-3">
      <p className="text-sm font-semibold text-ink">{event.type}</p>
      <pre className="event-payload">{JSON.stringify(event.payload, null, 2)}</pre>
    </article>
  );
}

function StatusBadge({ run, sseStatus }: { run: Run | null; sseStatus: SseStatus }) {
  return (
    <div className="self-end rounded-md border border-line bg-slate-50 px-3 py-2">
      <p className="text-xs uppercase text-muted">Run</p>
      <p className="text-sm font-semibold text-ink">{run?.status ?? "none"} · {sseStatus}</p>
    </div>
  );
}

function SseBadge({ status }: { status: SseStatus }) {
  return <span className="rounded-full border border-line px-2 py-1 text-xs font-semibold text-ink">{status}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-line p-4 text-sm text-muted">{text}</p>;
}

function MockFallback({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-semibold text-amber-950">{label} development fallback</p>
      <p className="mt-1 text-sm text-amber-900">{text}</p>
    </div>
  );
}

function ErrorText({ error }: { error: unknown }) {
  return <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-danger">{error instanceof Error ? error.message : String(error)}</p>;
}

function tabMatchesEvent(tab: string, event: RunEvent): boolean {
  return (
    (tab === "Screenshots" && event.type === "browser.screenshot") ||
    (tab === "DOM" && event.type === "browser.dom_snapshot") ||
    (tab === "Console" && event.type === "browser.console") ||
    (tab === "Network" && event.type === "browser.network")
  );
}

function tabMatchesArtifact(tab: string, artifact: Artifact): boolean {
  const type = artifactType(artifact);
  return (
    (tab === "Screenshots" && type === "screenshot") ||
    (tab === "DOM" && type === "dom") ||
    (tab === "Console" && type === "console") ||
    (tab === "Network" && type === "network")
  );
}

function formatScore(score: number | undefined): string {
  return typeof score === "number" ? score.toFixed(3) : "n/a";
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString();
}
