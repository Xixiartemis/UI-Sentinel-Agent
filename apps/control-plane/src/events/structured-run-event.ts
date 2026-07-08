export interface StructuredRunEvent {
  event_id: string;
  run_id: string;
  timestamp: string;
  agent: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
}
