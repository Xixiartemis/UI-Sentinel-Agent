import { create } from "zustand";
import { Project, Run } from "./types";

interface WorkspaceState {
  selectedProjectId: string;
  selectedRunId: string;
  currentRun: Run | null;
  setSelectedProjectId: (projectId: string) => void;
  setSelectedRunId: (runId: string) => void;
  setCurrentRun: (run: Run | null) => void;
  selectProject: (project: Project) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  selectedProjectId: "",
  selectedRunId: "",
  currentRun: null,
  setSelectedProjectId: (projectId) => set({ selectedProjectId: projectId }),
  setSelectedRunId: (runId) => set({ selectedRunId: runId }),
  setCurrentRun: (run) => set({ currentRun: run }),
  selectProject: (project) =>
    set({
      selectedProjectId: project.id,
      currentRun: null,
      selectedRunId: "",
    }),
}));
