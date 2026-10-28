"use client";

import { useRef, useState } from "react";
import type { PlatformId } from "@/types/riot";
import type { SummonerPreview } from "@/types/team-builder";
import { TEAM_SIZE } from "@/types/team-builder";
import { TEAM_BUILDER_CONFIG } from "@/lib/team-builder/config";
import { parseRiotId } from "@/lib/team-builder/parse-input";
import { RosterCard, SummonerPreviewCard } from "./summoner-cards";
import { formatDuration } from "./ui-helpers";
import { fetchSummonerPreview, splitList, type AddManyResult, type useRoster } from "./use-roster";

type Roster = ReturnType<typeof useRoster>;

type Lookup =
  | { state: "idle" }
  | { state: "loading"; query: string }
  | { state: "found"; query: string; profile: SummonerPreview }
  | { state: "error"; query: string; message: string };

function describeBulk(r: AddManyResult): string {
  const parts = [`${r.added} agregado${r.added === 1 ? "" : "s"}`];
  if (r.duplicates.length) parts.push(`${r.duplicates.length} repetido${r.duplicates.length === 1 ? "" : "s"} ignorado(s)`);
  if (r.invalid.length) parts.push(`No se agregó ningún jugador. Revisa: ${r.invalid.map((i) => `“${i.raw}”: ${i.reason}`).join("; ")}`);
  if (r.overflow) parts.push(`${r.overflow} excede(n) el máximo de ${TEAM_BUILDER_CONFIG.maxPlayers}`);
  return parts.join(" · ");
}

export function RosterEditor({
  roster,
  platform,
  onSubmit,
  query,
  setQuery,
}: {
  roster: Roster;
  platform: PlatformId;
  onSubmit: () => void;
  query: string;
  setQuery: (query: string) => void;
}) {
  const [lookup, setLookup] = useState<Lookup>({ state: "idle" });
  const [notice, setNotice] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { entries, isImporting } = roster;
  const ready = entries.filter((e) => e.status === "ready").length;
  const pending = entries.filter((e) => e.status === "loading").length;
  const failed = entries.length - ready - pending;
  const count = entries.length;
  const canBuild = !isImporting && count >= TEAM_BUILDER_CONFIG.minPlayers && count % TEAM_SIZE === 0 && ready === count;
  const isList = /[,\n\r;]/.test(query);

  const addList = async (text: string) => {
    if (isImporting) return;
    abortRef.current?.abort();
    setQuery(text);
    setLookup({ state: "idle" });
    setNotice({ tone: "info", text: "Validando todos los perfiles. La lista se agregará solo si todos son válidos..." });
    const result = await roster.addMany(splitList(text));
    setNotice({ tone: result.invalid.length > 0 || result.overflow > 0 ? "error" : "info", text: describeBulk(result) });
    if (result.invalid.length === 0 && result.overflow === 0) setQuery("");
  };

  const search = async (text: string) => {
    const parsed = parseRiotId(text);
    if ("reason" in parsed) {
      setLookup({ state: "error", query: text, message: parsed.reason });
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLookup({ state: "loading", query: text });
    try {
      const profile = await fetchSummonerPreview(parsed, platform, controller.signal);
      setLookup({ state: "found", query: text, profile });
    } catch (error) {
      if (controller.signal.aborted) return;
      setLookup({ state: "error", query: text, message: error instanceof Error ? error.message : "Error al buscar" });
    }
  };

  const addFound = (profile: SummonerPreview) => {
    const problem = roster.addProfile(profile);
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    setNotice(null);
    setQuery("");
    setLookup({ state: "idle" });
    inputRef.current?.focus();
  };

  const handleEnter = () => {
    if (isImporting) return;
    const text = query.trim();
    if (!text) return;
    if (isList) return addList(text);
    // Segundo Enter sobre la misma búsqueda = agregar.
    if (lookup.state === "found" && lookup.query === text && !roster.has(lookup.profile.riotId)) {
      return addFound(lookup.profile);
    }
    if (lookup.state !== "loading" || lookup.query !== text) void search(text);
  };

  const statusText =
    count === 0
      ? `Agrega al menos ${TEAM_BUILDER_CONFIG.minPlayers} jugadores (múltiplo de ${TEAM_SIZE}).`
      : pending > 0
        ? `Buscando ${pending} jugador${pending === 1 ? "" : "es"}...`
        : failed > 0
          ? `${failed} jugador${failed === 1 ? "" : "es"} con error: corrígelos o quítalos.`
          : count < TEAM_BUILDER_CONFIG.minPlayers
            ? `${count} jugadores · faltan ${TEAM_BUILDER_CONFIG.minPlayers - count} para el mínimo.`
            : count % TEAM_SIZE !== 0
              ? `${count} jugadores · agrega ${TEAM_SIZE - (count % TEAM_SIZE)} o quita ${count % TEAM_SIZE} para formar equipos de ${TEAM_SIZE}.`
              : `${count} jugadores → ${count / TEAM_SIZE} equipos`;

  return (
    <fieldset disabled={isImporting} aria-busy={isImporting} className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur">
      <p className="mb-3 text-xs text-slate-400">Las listas se validan completas: si un perfil falla, no se agrega ninguno.</p>
      <label htmlFor="summoner-search" className="mb-2 block text-sm font-medium text-slate-200">
        Buscar invocador <span className="text-slate-500">(Nombre#TAG — o pega una lista separada por comas)</span>
      </label>
      <div className="flex gap-2">
        <input
          id="summoner-search"
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotice(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleEnter();
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[,\n\r;]/.test(text)) {
              e.preventDefault();
              addList(query.trim() ? `${query},${text}` : text);
            }
          }}
          placeholder="Ej: Ing Wrld#COL"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
        />
        <button
          type="button"
          onClick={handleEnter}
          disabled={!query.trim() || lookup.state === "loading"}
          className="rounded-xl px-5 py-3 text-sm font-medium text-slate-100 ring-1 ring-white/15 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isList ? `Agregar ${splitList(query).length}` : "Buscar"}
        </button>
      </div>

      {lookup.state === "loading" && (
        <div className="mt-4 flex items-center gap-4 rounded-2xl border border-white/5 bg-white/[0.03] p-5">
          <div className="h-20 w-20 animate-pulse rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
          </div>
        </div>
      )}
      {lookup.state === "error" && (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {lookup.message}
        </p>
      )}
      {lookup.state === "found" && (
        <SummonerPreviewCard
          profile={lookup.profile}
          alreadyAdded={roster.has(lookup.profile.riotId)}
          onAdd={() => addFound(lookup.profile)}
        />
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-3 text-xs ${notice.tone === "error" ? "text-rose-300" : "text-emerald-300"}`}>{notice.text}</p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Jugadores <span className="text-slate-500">({count}/{TEAM_BUILDER_CONFIG.maxPlayers})</span>
        </h3>
        {count > 0 && (
          <button
            type="button"
            onClick={() => {
              roster.clear();
              setNotice(null);
            }}
            className="text-xs text-slate-400 transition hover:text-rose-300"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {count === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">
          Aún no hay jugadores. Busca uno y presiona Enter, o pega la lista completa.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {entries.map((entry, i) => (
            <RosterCard
              key={entry.key}
              entry={entry}
              index={i}
              onRemove={() => roster.remove(entry.key)}
              onRetry={() => roster.retry(entry.key)}
            />
          ))}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4 text-sm">
        <p className={failed > 0 ? "text-rose-300" : canBuild ? "text-emerald-300" : "text-slate-400"}>{statusText}</p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canBuild}
          className="rounded-xl bg-amber-400 px-6 py-2.5 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          Armar equipos
        </button>
      </div>
      {canBuild && (
        <p className="mt-3 text-xs text-slate-500">
          Se analizarán hasta {TEAM_BUILDER_CONFIG.matchesToAnalyze} partidas clasificatorias por jugador. Sin caché, esto
          toma aprox. {formatDuration(Math.max(1, Math.ceil((count * 53) / 80) - 1) * 120_000)} por los límites de la API
          de Riot.
        </p>
      )}
    </fieldset>
  );
}
