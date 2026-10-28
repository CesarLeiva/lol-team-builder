import type { RankInfo, Role, RoleFit } from "@/types/team-builder";
import { TIER_LABEL_ES } from "@/lib/team-builder/mmr";

export function formatRank(rank: RankInfo | null): string {
  if (!rank) return "Sin rango";
  const apex = rank.tier === "MASTER" || rank.tier === "GRANDMASTER" || rank.tier === "CHALLENGER";
  return `${TIER_LABEL_ES[rank.tier]}${apex ? "" : ` ${rank.division}`} · ${rank.leaguePoints} LP`;
}

export function rankWinrate(rank: RankInfo): string {
  const games = rank.wins + rank.losses;
  return games > 0 ? `${Math.round((rank.wins / games) * 100)}% (${rank.wins}V ${rank.losses}D)` : "";
}

export const TIER_COLOR: Record<RankInfo["tier"], string> = {
  IRON: "text-stone-400",
  BRONZE: "text-orange-300",
  SILVER: "text-slate-300",
  GOLD: "text-yellow-300",
  PLATINUM: "text-teal-300",
  EMERALD: "text-emerald-300",
  DIAMOND: "text-cyan-300",
  MASTER: "text-fuchsia-300",
  GRANDMASTER: "text-rose-300",
  CHALLENGER: "text-amber-200",
};

export const ROLE_LABEL: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungla",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
};

export const ROLE_ICON: Record<Role, string> = {
  TOP: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-top.png",
  JUNGLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-jungle.png",
  MIDDLE: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-middle.png",
  BOTTOM: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-bottom.png",
  UTILITY: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-utility.png",
};

export const FIT_STYLE: Record<RoleFit, { label: string; className: string }> = {
  MAIN: { label: "Main", className: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  SECONDARY: { label: "Secundario", className: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  PLAYED: { label: "Ocasional", className: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  OFF_ROLE: { label: "Fuera de rol", className: "bg-rose-500/15 text-rose-300 ring-rose-500/30" },
  FILL: { label: "Fill", className: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
};

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min === 0) return `${sec} s`;
  return `${min} min ${sec.toString().padStart(2, "0")} s`;
}

/** Color del texto según el tier aproximado del MMR. */
export function mmrColor(mmr: number): string {
  if (mmr >= 2400) return "text-fuchsia-300";
  if (mmr >= 2200) return "text-cyan-300";
  if (mmr >= 2000) return "text-emerald-300";
  if (mmr >= 1800) return "text-teal-300";
  if (mmr >= 1600) return "text-yellow-300";
  if (mmr >= 1400) return "text-slate-300";
  if (mmr >= 1200) return "text-orange-300";
  return "text-stone-400";
}
