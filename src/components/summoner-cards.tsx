"use client";

import type { SummonerPreview } from "@/types/team-builder";
import { formatRiotId } from "@/lib/team-builder/parse-input";
import type { RosterEntry } from "./use-roster";
import { TIER_COLOR, formatRank, rankWinrate } from "./ui-helpers";

export function SummonerIcon({
  profile,
  size = 48,
  showLevel = true,
}: {
  profile: SummonerPreview;
  size?: number;
  showLevel?: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Íconos pequeños de un CDN externo: next/image no aporta nada aquí. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profile.iconUrl}
        alt=""
        width={size}
        height={size}
        className="h-full w-full rounded-full object-cover ring-2 ring-amber-400/40"
        onError={(e) => {
          if (e.currentTarget.src !== profile.iconFallbackUrl) e.currentTarget.src = profile.iconFallbackUrl;
        }}
      />
      {showLevel && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950 px-1.5 text-[10px] font-semibold leading-4 text-amber-200 ring-1 ring-amber-400/40">
          {profile.summonerLevel}
        </span>
      )}
    </div>
  );
}

function RankLine({ label, rank }: { label: string; rank: SummonerPreview["soloRank"] }) {
  return (
    <p className="text-sm">
      <span className="text-slate-500">{label}: </span>
      <span className={rank ? `font-medium ${TIER_COLOR[rank.tier]}` : "text-slate-500"}>{formatRank(rank)}</span>
      {rank && <span className="text-xs text-slate-500"> · {rankWinrate(rank)}</span>}
    </p>
  );
}

/** Vista previa grande que aparece al presionar Enter. */
export function SummonerPreviewCard({
  profile,
  alreadyAdded,
  onAdd,
}: {
  profile: SummonerPreview;
  alreadyAdded: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-5 rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-transparent p-5">
      <SummonerIcon profile={profile} size={80} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-bold text-white">
          {profile.riotId.gameName}
          <span className="font-normal text-slate-500">#{profile.riotId.tagLine}</span>
        </p>
        <p className="mb-1 text-xs text-slate-400">Nivel {profile.summonerLevel}</p>
        <RankLine label="Solo/Duo" rank={profile.soloRank} />
        <RankLine label="Flex" rank={profile.flexRank} />
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={alreadyAdded}
        className="rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-slate-950 shadow-lg shadow-amber-500/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
      >
        {alreadyAdded ? "Ya está en la lista" : "+ Agregar"}
      </button>
    </div>
  );
}

/** Tarjeta compacta dentro de la lista de jugadores. */
export function RosterCard({
  entry,
  index,
  onRemove,
  onRetry,
}: {
  entry: RosterEntry;
  index: number;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const removeButton = (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Quitar ${formatRiotId(entry.riotId)}`}
      className="rounded-md px-2 py-1 text-slate-500 transition hover:bg-white/10 hover:text-rose-300"
    >
      ✕
    </button>
  );

  if (entry.status === "loading") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-300">{formatRiotId(entry.riotId)}</p>
          <p className="text-xs text-slate-500">Buscando...</p>
        </div>
        {removeButton}
      </li>
    );
  }

  if (entry.status === "error") {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500/15 text-rose-300">!</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-rose-200">{formatRiotId(entry.riotId)}</p>
          <p className="truncate text-xs text-rose-300/80" title={entry.message}>
            {entry.message}
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-2 py-1 text-xs text-slate-300 transition hover:bg-white/10"
        >
          Reintentar
        </button>
        {removeButton}
      </li>
    );
  }

  const { profile } = entry;
  const rank = profile.soloRank ?? profile.flexRank;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 transition hover:border-white/10">
      <span className="w-5 text-right text-xs tabular-nums text-slate-600">{index + 1}</span>
      <SummonerIcon profile={profile} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {profile.riotId.gameName}
          <span className="font-normal text-slate-500">#{profile.riotId.tagLine}</span>
        </p>
        <p className="truncate text-xs">
          <span className={rank ? TIER_COLOR[rank.tier] : "text-slate-500"}>{formatRank(rank)}</span>
          {!profile.soloRank && profile.flexRank && <span className="text-slate-500"> (Flex)</span>}
        </p>
      </div>
      {removeButton}
    </li>
  );
}
