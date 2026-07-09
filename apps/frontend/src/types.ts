export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface Project {
  id: string;
  name: string;
  localPath?: string;
  local_path?: string;
}

export interface CreateProjectRequest {
  name: string;
  local_path: string;
}

export interface CreateRunRequest {
  project_id: string;
  target_url: string;
  task_goal: string;
}

export interface Run {
  id: string;
  projectId?: string;
  project_id?: string;
  targetUrl?: string;
  target_url?: string;
  taskGoal?: string;
  task_goal?: string;
  status: RunStatus;
  project?: Project;
  artifacts?: Artifact[];
  diagnosisReports?: DiagnosisReportRecord[];
}

export interface RunEvent {
  event_id: string;
  run_id: string;
  timestamp: string;
  agent: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface Artifact {
  id?: string;
  artifactType?: string;
  artifact_type?: string;
  storageKey?: string;
  storage_key?: string;
  createdAt?: string;
  created_at?: string;
}

export interface RetrievalMatch {
  chunk_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  chunk_type?: string;
  symbol_name?: string;
  final_score?: number;
  content?: string;
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
  missing_evidence?: string[];
}

export interface DiagnosisReport {
  summary: string;
  severity: string;
  claims: DiagnosisClaim[];
  fix_suggestions?: FixSuggestion[];
  fixSuggestions?: FixSuggestion[];
  verifier_result?: VerifierResult;
  verifierResult?: VerifierResult;
}

export interface DiagnosisReportRecord {
  id: string;
  summary: string;
  severity: string;
  claims: DiagnosisClaim[];
  fixSuggestions?: FixSuggestion[];
  fix_suggestions?: FixSuggestion[];
  verifierResult?: VerifierResult;
  verifier_result?: VerifierResult;
  createdAt?: string;
}

export type SseStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";
