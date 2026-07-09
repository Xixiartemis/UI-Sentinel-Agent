import { useState } from "react";
import { DashboardPage, RunWorkspacePage } from "./components";

type Page = "dashboard" | "workspace";

export function App() {
  const [page, setPage] = useState<Page>("dashboard");

  return (
    <div className="min-h-screen bg-page text-ink">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-5 py-4">
          <div>
            <h1 className="text-xl font-semibold">UI Sentinel Agent</h1>
            <p className="text-sm text-muted">MVP run workspace</p>
          </div>
          <nav className="flex gap-2">
            <button
              className={`nav-button ${page === "dashboard" ? "nav-button-active" : ""}`}
              type="button"
              onClick={() => setPage("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`nav-button ${page === "workspace" ? "nav-button-active" : ""}`}
              type="button"
              onClick={() => setPage("workspace")}
            >
              Run Workspace
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-5 py-5">
        {page === "dashboard" ? (
          <DashboardPage onOpenWorkspace={() => setPage("workspace")} />
        ) : (
          <RunWorkspacePage />
        )}
      </main>
    </div>
  );
}
