import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getRunEvents, runStreamUrl } from "./api";
import { RunEvent, SseStatus } from "./types";

const streamEventTypes = [
  "run.started",
  "browser.started",
  "browser.step",
  "browser.screenshot",
  "browser.dom_snapshot",
  "browser.console",
  "browser.network",
  "browser.completed",
  "indexer.started",
  "indexer.file_scanned",
  "indexer.chunk_created",
  "indexer.embedding_created",
  "indexer.completed",
  "indexer.failed",
  "rag.retrieved",
  "diagnosis.started",
  "diagnosis.completed",
  "diagnosis.failed",
  "run.completed",
  "run.failed",
];

function eventTime(event: RunEvent): number {
  const time = Date.parse(event.timestamp);
  return Number.isNaN(time) ? 0 : time;
}

function mergeEvents(current: RunEvent[], incoming: RunEvent[]): RunEvent[] {
  const byId = new Map<string, RunEvent>();
  for (const event of current) {
    byId.set(event.event_id, event);
  }
  for (const event of incoming) {
    byId.set(event.event_id, event);
  }
  return [...byId.values()].sort((left, right) => eventTime(left) - eventTime(right));
}

export function useRunEvents(runId: string) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<SseStatus>("idle");
  const [error, setError] = useState<string>("");
  const sourceRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const connect = useCallback(async () => {
    close();

    if (!runId) {
      setEvents([]);
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    setError("");

    try {
      const history = await getRunEvents(runId);
      setEvents((current) => mergeEvents(current, history));

      const source = new EventSource(runStreamUrl(runId));
      sourceRef.current = source;

      source.onopen = () => {
        setStatus("connected");
      };

      const handleMessage = (message: MessageEvent<string>) => {
        const parsed = JSON.parse(message.data) as RunEvent;
        setEvents((current) => mergeEvents(current, [parsed]));
      };
      source.onmessage = handleMessage;
      for (const eventType of streamEventTypes) {
        source.addEventListener(eventType, handleMessage);
      }

      source.onerror = () => {
        setStatus("disconnected");
        setError("SSE disconnected. Reconnect to recover historical events and resume live updates.");
        source.close();
      };
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Failed to load run events.");
    }
  }, [close, runId]);

  useEffect(() => {
    void connect();
    return close;
  }, [close, connect]);

  const grouped = useMemo(() => {
    return events.reduce<Record<string, RunEvent[]>>((groups, event) => {
      const key = event.agent || "run";
      groups[key] = [...(groups[key] ?? []), event];
      return groups;
    }, {});
  }, [events]);

  return {
    events,
    grouped,
    status,
    error,
    reconnect: connect,
  };
}
