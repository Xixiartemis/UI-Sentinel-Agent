import {
  Artifact,
  DiagnosisReport,
  DiagnosisReportRecord,
  RetrievalMatch,
  Run,
  RunEvent,
} from "./types";

export function projectLocalPath(project: { localPath?: string; local_path?: string }): string {
  return project.localPath ?? project.local_path ?? "";
}

export function runTargetUrl(run: Run | null): string {
  return run?.targetUrl ?? run?.target_url ?? "";
}

export function runTaskGoal(run: Run | null): string {
  return run?.taskGoal ?? run?.task_goal ?? "";
}

export function artifactType(artifact: Artifact): string {
  return artifact.artifactType ?? artifact.artifact_type ?? "artifact";
}

export function artifactStorageKey(artifact: Artifact): string {
  return artifact.storageKey ?? artifact.storage_key ?? "";
}

export function artifactEvents(events: RunEvent[]): RunEvent[] {
  return events.filter((event) =>
    ["browser.screenshot", "browser.dom_snapshot", "browser.console", "browser.network"].includes(
      event.type,
    ),
  );
}

export function retrievalMatches(events: RunEvent[]): RetrievalMatch[] {
  const latest = [...events].reverse().find((event) => event.type === "rag.retrieved");
  const matches = latest?.payload.matches;
  return Array.isArray(matches) ? (matches as RetrievalMatch[]) : [];
}

export function diagnosisFromEvents(events: RunEvent[]): DiagnosisReport | null {
  const latest = [...events].reverse().find((event) => event.type === "diagnosis.completed");
  if (!latest) {
    return null;
  }
  const verifierResult =
    typeof latest.payload.verifier_result === "object" && latest.payload.verifier_result
      ? (latest.payload.verifier_result as NonNullable<DiagnosisReport["verifier_result"]>)
      : {
          verified: Boolean(latest.payload.verified),
          unsupported_claims: [],
        };

  return {
    summary: String(latest.payload.summary ?? "Diagnosis completed."),
    severity: String(latest.payload.severity ?? "medium"),
    claims: Array.isArray(latest.payload.claims) ? latest.payload.claims : [],
    fix_suggestions: Array.isArray(latest.payload.fix_suggestions)
      ? latest.payload.fix_suggestions
      : [],
    verifier_result: verifierResult,
  };
}

export function latestPersistedDiagnosis(run: Run | null): DiagnosisReportRecord | null {
  return run?.diagnosisReports?.[0] ?? null;
}
