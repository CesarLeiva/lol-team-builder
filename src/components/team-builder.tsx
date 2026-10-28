"use client";

import { useEffect, useState } from "react";
import type { PlatformId } from "@/types/riot";
import { formatRiotId } from "@/lib/team-builder/parse-input";
import { LoadingScreen } from "./loading-screen";
import { RosterEditor } from "./roster-editor";
import { TeamCard } from "./team-card";
import { formatDuration } from "./ui-helpers";
import { useBuildTeams } from "./use-build-teams";
import { useRoster } from "./use-roster";
import { EMPTY_SESSION, SESSION_KEY, parseSession, type BrowserSession } from "./browser-session";

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "la1", label: "LAN" },
  { id: "la2", label: "LAS" },
  { id: "na1", label: "NA" },
  { id: "br1", label: "BR" },
  { id: "euw1", label: "EUW" },
  { id: "eun1", label: "EUNE" },
  { id: "tr1", label: "TR" },
  { id: "ru", label: "RU" },
  { id: "me1", label: "ME" },
  { id: "kr", label: "KR" },
  { id: "jp1", label: "JP" },
  { id: "oc1", label: "OCE" },
  { id: "sg2", label: "SEA" },
  { id: "tw2", label: "TW" },
  { id: "vn2", label: "VN" },
];

export function TeamBuilder() {
  const [restored, setRestored] = useState<{ session: BrowserSession; warning: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        setRestored({ session: raw ? parseSession(raw) : EMPTY_SESSION, warning: null });
      } catch (error) {
        console.error("[browser-session] No se pudo restaurar la sesión", error);
        setRestored({ session: EMPTY_SESSION, warning: "No se pudo recuperar la sesión guardada. Puedes iniciar una nueva lista." });
      }
    });
    return () => { active = false; };
  }, []);
  if (!restored) return <p role="status" className="text-slate-400">Recuperando sesión del navegador...</p>;
  return <SavedTeamBuilder initialSession={restored.session} initialWarning={restored.warning} />;
}

function SavedTeamBuilder({ initialSession, initialWarning }: {
  initialSession: BrowserSession;
  initialWarning: string | null;
}) {
  const [platform, setPlatform] = useState<PlatformId>(initialSession.platform);
  const [draft, setDraft] = useState(initialSession.draft);
  const [warning, setWarning] = useState(initialWarning);
  const roster = useRoster(platform, initialSession.entries);
  const { status, start, cancel, reset } = useBuildTeams(initialSession.result ?? { state: "idle" });

  useEffect(() => {
    try {
      const session: BrowserSession = {
        version: 1, platform, draft,
        entries: roster.entries.filter((entry) => entry.status === "ready"),
        result: status.state === "done" ? status : null,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.error("[browser-session] No se pudo guardar la sesión", error);
      queueMicrotask(() => setWarning("El navegador no permite guardar la sesión o no tiene espacio. Los cambios se perderán al cerrar la página."));
    }
  }, [platform, draft, roster.entries, status]);

  const build = () => start(roster.entries.map((e) => formatRiotId(e.riotId)).join(", "), platform);

  const storageNotice = warning && <p role="alert" className="mb-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{warning}</p>;

  if (status.state === "loading") {
    return <div className="w-full">{storageNotice}<LoadingScreen progress={status.progress} onCancel={cancel} /></div>;
  }

  if (status.state === "done") {
    const { result, elapsedMs } = status;
    return (
      <section className="w-full">
        {storageNotice}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">{result.teams.length} equipos balanceados</h2>
            <p className="text-sm text-slate-400">
              Diferencia máxima entre promedios: <strong className="text-slate-200">{result.mmrSpread} MMR</strong> ·
              Jugadores fuera de su main: <strong className="text-slate-200">{result.offRoleCount}</strong> · Tiempo:{" "}
              {formatDuration(elapsedMs)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={build}
              className="rounded-lg px-4 py-2 text-sm text-slate-200 ring-1 ring-white/15 transition hover:bg-white/10"
            >
              Recalcular
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300"
            >
              Editar jugadores
            </button>
          </div>
        </div>

        {result.warnings.length > 0 && (
          <ul className="mb-6 space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
            {result.warnings.map((w) => (
              <li key={w}>⚠️ {w}</li>
            ))}
          </ul>
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {result.teams.map((team, i) => (
            <TeamCard key={team.id} team={team} index={i} />
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Pasa el cursor sobre un jugador para ver el desglose de su True MMR.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl">
      {storageNotice}
      <p className="mb-3 text-xs text-slate-500">La lista y los equipos se guardan automáticamente en este navegador. Un cálculo en curso no se reanuda al cerrar la página.</p>
      <div className="mb-3 flex items-center justify-end gap-2 text-sm">
        <label htmlFor="platform" className="text-slate-400">
          Servidor
        </label>
        <select
          id="platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as PlatformId)}
          disabled={roster.entries.length > 0 || roster.isImporting}
          title={roster.entries.length > 0 ? "Vacía la lista para cambiar de servidor" : undefined}
          className="rounded-lg border border-white/10 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-50"
        >
          {PLATFORMS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <RosterEditor roster={roster} platform={platform} onSubmit={build} query={draft} setQuery={setDraft} />

      {status.state === "error" && (
        <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200">
          <p className="font-semibold">No se pudieron armar los equipos</p>
          <p className="mt-1">{status.message}</p>
          {status.errors && status.errors.length > 0 && (
            <ul className="mt-3 list-inside list-disc space-y-0.5 text-rose-200/80">
              {status.errors.map((e) => (
                <li key={formatRiotId(e.riotId)}>
                  <strong>{formatRiotId(e.riotId)}</strong>: {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
