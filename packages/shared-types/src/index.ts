export type RunStatus = "queued" | "running" | "completed" | "failed";

export type RunEventStatus = "queued" | "running" | "completed" | "failed";

export type RunEventType =
  | "run.started"
  | "browser.started"
  | "browser.step"
  | "browser.screenshot"
  | "browser.dom_snapshot"
  | "browser.console"
  | "browser.network"
  | "browser.completed"
  | "indexer.started"
  | "indexer.file_scanned"
  | "indexer.chunk_created"
  | "indexer.embedding_created"
  | "indexer.completed"
  | "indexer.failed"
  | "rag.retrieved"
  | "diagnosis.started"
  | "diagnosis.completed"
  | "diagnosis.failed"
  | "run.completed"
  | "run.failed";

export interface RunEvent<TPayload = Record<string, unknown>> {
  event_id: string;
  run_id: string;
  timestamp: string;
  agent: string;
  type: RunEventType;
  status: RunEventStatus;
  payload: TPayload;
}

export interface CreateProjectRequest {
  name: string;
  local_path: string;
}

export interface Project {
  id: string;
  name: string;
  local_path: string;
}

export interface CreateRunRequest {
  project_id: string;
  target_url: string;
  task_goal: string;
}

export interface Run extends CreateRunRequest {
  id: string;
  status: RunStatus;
}

export type ArtifactType = "screenshot" | "dom" | "console" | "network";

export interface Artifact {
  id: string;
  run_id: string;
  artifact_type: ArtifactType;
  storage_key: string;
  created_at: string;
}

export interface RetrievalMatch {
  chunk_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type:
    | "file"
    | "component"
    | "function"
    | "hook"
    | "api_module"
    | "validation"
    | "route_or_page";
  symbol_name: string;
  vector_score: number;
  keyword_score: number;
  final_score: number;
  content?: string;
}

export interface RetrievalResult {
  rewritten_queries: string[];
  matches: RetrievalMatch[];
}

export interface DiagnosisClaim {
  text: string;
  evidence_ids: string[];
}

export interface FixSuggestion {
  file_path: string;
  suggestion: string;
}

export interface VerifierResult {
  verified: boolean;
  unsupported_claims: string[];
  missing_evidence: string[];
}

export interface DiagnosisReport {
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  claims: DiagnosisClaim[];
  fix_suggestions: FixSuggestion[];
  verifier_result: VerifierResult;
}
