import {
  CreateProjectRequest,
  CreateRunRequest,
  Project,
  Run,
  RunEvent,
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3100";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return body as T;
}

export function listProjects(): Promise<Project[]> {
  return request<Project[]>("/api/projects");
}

export function createProject(input: CreateProjectRequest): Promise<Project> {
  return request<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createRun(input: CreateRunRequest): Promise<Run> {
  return request<Run>("/api/runs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRun(id: string): Promise<Run> {
  return request<Run>(`/api/runs/${id}`);
}

export function getRunEvents(id: string): Promise<RunEvent[]> {
  return request<RunEvent[]>(`/api/runs/${id}/events`);
}

export function runStreamUrl(id: string): string {
  return `${API_BASE_URL}/api/runs/${id}/stream`;
}
