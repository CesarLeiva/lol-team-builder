"use client";

import { useEffect, useState } from "react";
import type { BuildPhase } from "@/types/team-builder";
import type { BuildProgress } from "./use-build-teams";
import { formatDuration } from "./ui-helpers";

const PHASES: { id: BuildPhase; label: string }[] = [
  { id: "accounts", label: "Cuentas" },
  { id: "ranks", label: "Rangos" },
  { id: "matches", label: "Partidas" },
  { id: "analysis", label: "True MMR" },
  { id: "matchmaking", label: "Equipos" },
];

/** Peso de cada fase en la barra global (las partidas son casi todo el trabajo). */
function overallPercent(p: BuildProgress): number {
  const ratio = (done: number, total: number) => (total > 0 ? Math.min(1, done / total) : 0);
  switch (p.phase) {
    case "accounts":
      return 4 * ratio(p.currentPlayer, p.totalPlayers);
    case "ranks":
      return 4 + 4 * ratio(p.currentPlayer, p.totalPlayers);
    case "matches":
      return 8 + 88 * ratio(p.overallDone, p.overallTotal);
    case "analysis":
      return 97;
    case "matchmaking":
      return 99;
    default:
      return 0;
  }
}

function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function LoadingScreen({ progress, onCancel }: { progress: BuildProgress; onCancel: () => void }) {
  const now = useNow();
  const percent = overallPercent(progress);
  const phaseIndex = PHASES.findIndex((ph) => ph.id === progress.phase);
  const waitingMs = progress.waitingUntil ? progress.waitingUntil - now : 0;
  const elapsed = now - progress.startedAt;

  return (
    <section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0">
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-amber-400/20 border-t-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Calculando...</h2>
          <p className="text-sm text-slate-400">{progress.message}</p>
        </div>
      </div>

      <ol className="mt-8 grid grid-cols-5 gap-2 text-center text-xs">
        {PHASES.map((ph, i) => (
          <li key={ph.id} className="flex flex-col items-center gap-2">
            <span
              className={`h-1.5 w-full rounded-full ${
                i < phaseIndex ? "bg-amber-400" : i === phaseIndex ? "animate-pulse bg-amber-400/70" : "bg-white/10"
              }`}
            />
            <span className={i <= phaseIndex ? "text-slate-200" : "text-slate-500"}>{ph.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        {progress.totalPlayers > 0 && progress.phase !== "analysis" && progress.phase !== "matchmaking" && (
          <p className="text-lg font-medium text-white">
            Procesando jugador {Math.max(progress.currentPlayer, 1)} de {progress.totalPlayers}
            {progress.playerName && <span className="text-amber-300"> · {progress.playerName}</span>}
          </p>
        )}
        {progress.phase === "matches" && progress.matchesTotal !== undefined && (
          <p className="mt-1 text-sm text-slate-400">
            Partidas de este jugador: {progress.matchesFetched} / {progress.matchesTotal} · Total:{" "}
            {progress.overallDone} / {progress.overallTotal}
          </p>
        )}

        <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>{Math.floor(percent)}%</span>
          <span>
            Transcurrido: {formatDuration(elapsed)}
            {progress.etaMs !== null && progress.phase === "matches" && (
              <> · Restante aprox.: {formatDuration(progress.etaMs)}</>
            )}
          </span>
        </div>
      </div>

      {waitingMs > 0 && (
        <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          ⏳ {progress.waitReason === "retry-after" ? "Riot pidió una pausa" : "Límite de la API alcanzado"}.
          Reanudando en <strong>{formatDuration(waitingMs)}</strong>...
        </div>
      )}

      <p className="mt-6 rounded-xl bg-white/5 p-4 text-sm leading-relaxed text-slate-400">
        La Personal API Key de Riot permite solo <strong className="text-slate-200">100 peticiones cada 2 minutos</strong>.
        Analizamos 50 partidas clasificatorias por jugador, por lo que el proceso puede tardar varios minutos. Las
        partidas ya descargadas se guardan en caché, así que la próxima vez será más rápido. No cierres esta pestaña.
      </p>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-slate-300 ring-1 ring-white/15 transition hover:bg-white/10"
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}
