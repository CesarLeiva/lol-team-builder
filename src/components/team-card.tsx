import type { PlayerProfile, Team, TeamSlot } from "@/types/team-builder";
import { FIT_STYLE, ROLE_ICON, ROLE_LABEL, mmrColor } from "./ui-helpers";

const TEAM_ACCENTS = [
  "from-sky-500/25 border-sky-400/30",
  "from-rose-500/25 border-rose-400/30",
  "from-emerald-500/25 border-emerald-400/30",
  "from-violet-500/25 border-violet-400/30",
  "from-amber-500/25 border-amber-400/30",
  "from-cyan-500/25 border-cyan-400/30",
];

const TREND_ICON = { UP: "↗", DOWN: "↘", STABLE: "→" } as const;

function playerTooltip(p: PlayerProfile): string {
  const b = p.breakdown;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const rank = (r: PlayerProfile["soloRank"]) => (r ? `${r.tier} ${r.division} ${r.leaguePoints} LP` : "Sin rango");
  return [
    `Solo/Duo: ${rank(p.soloRank)} · Flex: ${rank(p.flexRank)}`,
    `Base (${b.baseSource}): ${b.base}`,
    `Lobby: ${sign(b.lobbyAdjustment)} · Rendimiento: ${sign(b.performanceAdjustment)}`,
    `Winrate: ${sign(b.winrateAdjustment)} · Tendencia: ${sign(b.trendAdjustment)}`,
    `Partidas analizadas: ${p.stats.analyzed} (${p.stats.soloQueue} Solo, ${p.stats.flex} Flex)`,
    `Confianza: ${Math.round(p.mmrConfidence * 100)}%`,
  ].join("\n");
}

function PlayerRow({ slot }: { slot: TeamSlot }) {
  const { player, role, fit } = slot;
  const fitStyle = FIT_STYLE[fit];
  const { stats } = player;

  return (
    <li className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5" title={playerTooltip(player)}>
      <div className="flex w-16 shrink-0 flex-col items-center text-center">
        {/* Recursos del cliente de LoL distribuidos por CommunityDragon; no consumen cuota de Riot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ROLE_ICON[role]} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{ROLE_LABEL[role]}</span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">
          {player.riotId.gameName}
          <span className="text-slate-500">#{player.riotId.tagLine}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`rounded-full px-2 py-0.5 ring-1 ${fitStyle.className}`}>{fitStyle.label}</span>
          {stats.analyzed > 0 && (
            <span className="text-slate-400">
              {Math.round(stats.winrate * 100)}% WR · {stats.analyzed} part. {TREND_ICON[stats.trend]}
            </span>
          )}
          {player.mmrSource !== "RANKED_SOLO" && (
            <span className="text-slate-500">
              {player.mmrSource === "RANKED_FLEX" ? "· por Flex" : player.mmrSource === "LOBBY_ESTIMATE" ? "· por lobby" : "· estimado"}
            </span>
          )}
        </div>
      </div>

      <div className="text-right">
        <p className={`font-semibold tabular-nums ${mmrColor(player.trueMmr)}`}>{player.trueMmr}</p>
        <p className="text-[11px] text-slate-400">{player.rankLabel}</p>
      </div>
    </li>
  );
}

export function TeamCard({ team, index }: { team: Team; index: number }) {
  const accent = TEAM_ACCENTS[index % TEAM_ACCENTS.length];
  return (
    <article className={`rounded-2xl border bg-gradient-to-b to-slate-900/80 p-5 shadow-xl shadow-black/30 ${accent}`}>
      <header className="mb-4 flex items-end justify-between">
        <h3 className="text-lg font-bold text-white">{team.name}</h3>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">MMR promedio</p>
          <p className={`text-2xl font-bold tabular-nums ${mmrColor(team.averageMmr)}`}>{team.averageMmr}</p>
          {team.averageTrueMmr !== team.averageMmr && (
            <p className="text-[11px] text-slate-500">sin penalización de rol: {team.averageTrueMmr}</p>
          )}
        </div>
      </header>
      <ul className="space-y-2">
        {team.slots.map((slot) => (
          <PlayerRow key={slot.player.puuid} slot={slot} />
        ))}
      </ul>
    </article>
  );
}
