"use client";

import { useCallback, useRef, useState } from "react";
import type { PlatformId } from "@/types/riot";
import type {
  BuildPhase,
  BuildTeamsEvent,
  PlayerFetchError,
  TeamBuildResult,
} from "@/types/team-builder";

export interface BuildProgress {
  phase: BuildPhase | null;
  message: string;
  totalPlayers: number;
  currentPlayer: number;
  playerName: string;
  matchesFetched?: number;
  matchesTotal?: number;
  overallDone: number;
  overallTotal: number;
  etaMs: number | null;
  /** Timestamp (ms) hasta el que estamos en pausa por rate limit. */
  waitingUntil: number | null;
  waitReason: "window" | "retry-after" | null;
  startedAt: number;
}

export type BuildStatus =
  | { state: "idle" }
  | { state: "loading"; progress: BuildProgress }
  | { state: "done"; result: TeamBuildResult; elapsedMs: number }
  | { state: "error"; message: string; errors?: PlayerFetchError[] };

const initialProgress = (): BuildProgress => ({
  phase: null,
  message: "Conectando con el servidor...",
  totalPlayers: 0,
  currentPlayer: 0,
  playerName: "",
  overallDone: 0,
  overallTotal: 0,
  etaMs: null,
  waitingUntil: null,
  waitReason: null,
  startedAt: Date.now(),
});

function reduce(progress: BuildProgress, event: BuildTeamsEvent): BuildProgress {
  switch (event.type) {
    case "start":
      return { ...progress, totalPlayers: event.totalPlayers, etaMs: event.estimatedMs };
    case "phase":
      return { ...progress, phase: event.phase, message: event.message };
    case "progress":
      return {
        ...progress,
        phase: event.phase,
        currentPlayer: event.current,
        totalPlayers: event.total,
        playerName: event.player,
        matchesFetched: event.matchesFetched,
        matchesTotal: event.matchesTotal,
        overallDone: event.overallDone ?? progress.overallDone,
        overallTotal: event.overallTotal ?? progress.overallTotal,
        etaMs: event.etaMs ?? progress.etaMs,
        // Si llegó progreso, ya no estamos esperando.
        waitingUntil: progress.waitingUntil && progress.waitingUntil > Date.now() ? progress.waitingUntil : null,
      };
    case "rate-limit-wait":
      return { ...progress, waitingUntil: Date.now() + event.waitMs, waitReason: event.reason };
    default:
      return progress;
  }
}

export function useBuildTeams(initialStatus: BuildStatus = { state: "idle" }) {
  const [status, setStatus] = useState<BuildStatus>(initialStatus);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (input: string, platform: PlatformId) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let progress = initialProgress();
    setStatus({ state: "loading", progress });

    try {
      const response = await fetch("/api/build-teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, platform }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        setStatus({ state: "error", message: data?.message ?? `Error HTTP ${response.status}` });
        return;
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as BuildTeamsEvent | { type: "heartbeat" };
          if (event.type === "heartbeat") continue;

          if (event.type === "done") {
            setStatus({ state: "done", result: event.result, elapsedMs: Date.now() - progress.startedAt });
            finished = true;
          } else if (event.type === "error") {
            setStatus({ state: "error", message: event.message, errors: event.errors });
            finished = true;
          } else {
            progress = reduce(progress, event);
            setStatus({ state: "loading", progress });
          }
        }
      }

      if (!finished) setStatus({ state: "error", message: "La conexión con el servidor se cerró inesperadamente." });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus({ state: "error", message: error instanceof Error ? error.message : "Error de red" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ state: "idle" });
  }, []);

  const reset = useCallback(() => setStatus({ state: "idle" }), []);

  return { status, start, cancel, reset };
}
