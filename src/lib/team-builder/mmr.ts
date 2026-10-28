import {
  QUEUE_RANKED_SOLO,
  RANKED_QUEUE_IDS,
  type Division,
  type LeagueEntryDto,
  type MatchDto,
  type ParticipantDto,
  type Tier,
} from "@/types/riot";
import {
  ROLES,
  type MatchStats,
  type MmrBreakdown,
  type MmrSource,
  type PlayerProfile,
  type RankInfo,
  type RiotId,
  type Role,
  type RoleCounts,
  type Trend,
} from "@/types/team-builder";
import { MMR_CONFIG, TEAM_BUILDER_CONFIG } from "./config";

// ---------------------------------------------------------------------------
// Rango <-> número
// ---------------------------------------------------------------------------

/** Cada tier vale 200 y cada división 50: Hierro IV = 1000, Plata IV = 1400, Oro IV = 1600... */
export const TIER_BASE_MMR: Record<Tier, number> = {
  IRON: 1000,
  BRONZE: 1200,
  SILVER: 1400,
  GOLD: 1600,
  PLATINUM: 1800,
  EMERALD: 2000,
  DIAMOND: 2200,
  MASTER: 2400,
  GRANDMASTER: 2550,
  CHALLENGER: 2700,
};

const DIVISION_OFFSET: Record<Division, number> = { IV: 0, III: 50, II: 100, I: 150 };
const DIVISIONS_ASC: Division[] = ["IV", "III", "II", "I"];
const APEX_TIERS: ReadonlySet<Tier> = new Set<Tier>(["MASTER", "GRANDMASTER", "CHALLENGER"]);
const LADDER_TIERS: Tier[] = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND"];

export const TIER_LABEL_ES: Record<Tier, string> = {
  IRON: "Hierro",
  BRONZE: "Bronce",
  SILVER: "Plata",
  GOLD: "Oro",
  PLATINUM: "Platino",
  EMERALD: "Esmeralda",
  DIAMOND: "Diamante",
  MASTER: "Maestro",
  GRANDMASTER: "Gran Maestro",
  CHALLENGER: "Retador",
};

export function rankToMmr(rank: Pick<RankInfo, "tier" | "division" | "leaguePoints">): number {
  const lp = Math.max(0, rank.leaguePoints);
  if (APEX_TIERS.has(rank.tier)) {
    // Master+ es una escalera continua por LP; GM/Chall tienen piso propio.
    return Math.max(TIER_BASE_MMR[rank.tier], TIER_BASE_MMR.MASTER + Math.min(lp, 1600) * 0.25);
  }
  return TIER_BASE_MMR[rank.tier] + DIVISION_OFFSET[rank.division] + Math.min(lp, 100) * 0.5;
}

export function mmrToRankLabel(mmr: number): string {
  if (mmr >= TIER_BASE_MMR.CHALLENGER) return TIER_LABEL_ES.CHALLENGER;
  if (mmr >= TIER_BASE_MMR.GRANDMASTER) return TIER_LABEL_ES.GRANDMASTER;
  if (mmr >= TIER_BASE_MMR.MASTER) return TIER_LABEL_ES.MASTER;
  const tierIndex = clamp(Math.floor((mmr - TIER_BASE_MMR.IRON) / 200), 0, LADDER_TIERS.length - 1);
  const tier = LADDER_TIERS[tierIndex];
  const divIndex = clamp(Math.floor((mmr - TIER_BASE_MMR[tier]) / 50), 0, 3);
  return `${TIER_LABEL_ES[tier]} ${DIVISIONS_ASC[divIndex]}`;
}

export function toRankInfo(entry: LeagueEntryDto | undefined, queue: RankInfo["queue"]): RankInfo | null {
  if (!entry) return null;
  return {
    queue,
    tier: entry.tier,
    division: entry.rank,
    leaguePoints: entry.leaguePoints,
    wins: entry.wins,
    losses: entry.losses,
  };
}

// ---------------------------------------------------------------------------
// Análisis por partida
// ---------------------------------------------------------------------------

export interface RawPlayerData {
  riotId: RiotId;
  puuid: string;
  leagueEntries: LeagueEntryDto[];
  matches: MatchDto[];
}

interface MatchSample {
  queueId: number;
  win: boolean;
  role: Role | null;
  /** -1..1 contra su rival de línea; null si no se pudo identificar. */
  performance: number | null;
  otherPuuids: string[];
}

function toRole(position: string | undefined): Role | null {
  return (ROLES as readonly string[]).includes(position ?? "") ? (position as Role) : null;
}

function participantRole(p: ParticipantDto): Role | null {
  return toRole(p.teamPosition) ?? toRole(p.individualPosition);
}

/** Diferencia relativa acotada a -1..1. */
function relDiff(a: number, b: number): number {
  return (a - b) / Math.max(a, b, 1);
}

const PERF_WEIGHTS: Record<Role, { gold: number; kda: number; damage: number; cs: number; vision: number }> = {
  TOP: { gold: 0.3, kda: 0.25, damage: 0.25, cs: 0.15, vision: 0.05 },
  JUNGLE: { gold: 0.3, kda: 0.3, damage: 0.2, cs: 0.1, vision: 0.1 },
  MIDDLE: { gold: 0.3, kda: 0.25, damage: 0.25, cs: 0.15, vision: 0.05 },
  BOTTOM: { gold: 0.3, kda: 0.25, damage: 0.25, cs: 0.15, vision: 0.05 },
  UTILITY: { gold: 0.15, kda: 0.35, damage: 0.15, cs: 0, vision: 0.35 },
};

/**
 * Compara al jugador contra su rival directo de línea en la misma partida.
 * Es independiente del rol (un support no se penaliza por tener poco oro)
 * y del nivel absoluto del lobby.
 */
export function performanceVsOpponent(me: ParticipantDto, opp: ParticipantDto, role: Role, minutes: number): number {
  const kda = (p: ParticipantDto) => (p.kills + p.assists) / Math.max(1, p.deaths);
  const cs = (p: ParticipantDto) => p.totalMinionsKilled + p.neutralMinionsKilled;
  const w = PERF_WEIGHTS[role];

  const gold = Math.tanh((me.goldEarned - opp.goldEarned) / minutes / 150);
  const kdaTerm = Math.tanh(Math.log((kda(me) + 1) / (kda(opp) + 1)));
  const damage = relDiff(me.totalDamageDealtToChampions, opp.totalDamageDealtToChampions);
  const csTerm = Math.tanh((cs(me) - cs(opp)) / minutes / 1.5);
  const vision = relDiff(me.visionScore, opp.visionScore);

  return w.gold * gold + w.kda * kdaTerm + w.damage * damage + w.cs * csTerm + w.vision * vision;
}

function gameDurationSec(match: MatchDto): number {
  return match.info.gameEndTimestamp ? match.info.gameDuration : match.info.gameDuration / 1000;
}

export function extractSample(match: MatchDto, puuid: string): MatchSample | null {
  const { info } = match;
  if (!RANKED_QUEUE_IDS.includes(info.queueId)) return null;

  const durationSec = gameDurationSec(match);
  if (durationSec < TEAM_BUILDER_CONFIG.minGameDurationSec) return null;

  const me = info.participants.find((p) => p.puuid === puuid);
  if (!me || me.gameEndedInEarlySurrender) return null;

  const role = participantRole(me);
  const opp = role
    ? info.participants.find((p) => p.teamId !== me.teamId && participantRole(p) === role)
    : undefined;

  return {
    queueId: info.queueId,
    win: me.win,
    role,
    performance: role && opp ? performanceVsOpponent(me, opp, role, Math.max(durationSec / 60, 1)) : null,
    otherPuuids: info.participants.filter((p) => p.puuid !== puuid).map((p) => p.puuid),
  };
}

// ---------------------------------------------------------------------------
// Helpers estadísticos
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** La partida más reciente (i = 0) pesa 1; pesa la mitad cada `recencyHalfLife` partidas. */
function recencyWeight(index: number): number {
  return 0.5 ** (index / MMR_CONFIG.recencyHalfLife);
}

function weightedMean(pairs: Array<{ value: number; weight: number }>): number | null {
  let sum = 0;
  let weights = 0;
  for (const { value, weight } of pairs) {
    sum += value * weight;
    weights += weight;
  }
  return weights > 0 ? sum / weights : null;
}

function mean(values: number[]): number | null {
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function round(value: number): number {
  return Math.round(value);
}

// ---------------------------------------------------------------------------
// Rango base
// ---------------------------------------------------------------------------

interface RankBase {
  value: number;
  source: MmrSource;
  confidence: number;
}

function computeRankBase(solo: RankInfo | null, flex: RankInfo | null): RankBase | null {
  const soloMmr = solo ? rankToMmr(solo) : null;
  const flexMmr = flex ? rankToMmr(flex) - MMR_CONFIG.flexOffset : null;

  if (soloMmr !== null) {
    const soloGames = solo!.wins + solo!.losses;
    const soloTrust = clamp(soloGames / MMR_CONFIG.minSoloGamesForFullTrust, 0, 1);
    const value = flexMmr !== null ? soloMmr * soloTrust + flexMmr * (1 - soloTrust) : soloMmr;
    // Riot no muestra rango sin partidas; un rango Solo siempre aporta bastante confianza.
    return { value, source: "RANKED_SOLO", confidence: 0.7 + 0.3 * soloTrust };
  }
  if (flexMmr !== null) return { value: flexMmr, source: "RANKED_FLEX", confidence: 0.65 };
  return null;
}

// ---------------------------------------------------------------------------
// Perfil completo
// ---------------------------------------------------------------------------

interface PreparedPlayer {
  raw: RawPlayerData;
  solo: RankInfo | null;
  flex: RankInfo | null;
  /** Ordenadas de más reciente a más antigua. */
  samples: MatchSample[];
  rankBase: RankBase | null;
}

function prepare(raw: RawPlayerData): PreparedPlayer {
  const solo = toRankInfo(raw.leagueEntries.find((e) => e.queueType === "RANKED_SOLO_5x5"), "SOLO");
  const flex = toRankInfo(raw.leagueEntries.find((e) => e.queueType === "RANKED_FLEX_SR"), "FLEX");
  const samples = [...raw.matches]
    .sort((a, b) => b.info.gameCreation - a.info.gameCreation)
    .map((m) => extractSample(m, raw.puuid))
    .filter((s): s is MatchSample => s !== null)
    .slice(0, TEAM_BUILDER_CONFIG.matchesToAnalyze);
  return { raw, solo, flex, samples, rankBase: computeRankBase(solo, flex) };
}

/**
 * Nivel del lobby: promedio (ponderado por recencia) del MMR de rango de los
 * participantes de sus partidas que también están en la lista y tienen rango.
 * No cuesta peticiones extra: usamos datos que ya descargamos.
 */
function estimateLobby(samples: MatchSample[], rankBaseByPuuid: Map<string, number>) {
  const pairs: Array<{ value: number; weight: number }> = [];
  samples.forEach((sample, i) => {
    for (const puuid of sample.otherPuuids) {
      const mmr = rankBaseByPuuid.get(puuid);
      if (mmr !== undefined) pairs.push({ value: mmr, weight: recencyWeight(i) });
    }
  });
  return { lobbyMmr: weightedMean(pairs), lobbySamples: pairs.length };
}

function computeRoles(samples: MatchSample[]) {
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, 0])) as RoleCounts;
  for (const s of samples) if (s.role) roleCounts[s.role]++;
  const rolePreference = ROLES.filter((r) => roleCounts[r] > 0).sort((a, b) => roleCounts[b] - roleCounts[a]);
  return {
    roleCounts,
    rolePreference,
    mainRole: rolePreference[0] ?? null,
    secondaryRole: rolePreference[1] ?? null,
  };
}

function analyzeForm(samples: MatchSample[]) {
  const n = samples.length;
  const winrateW = weightedMean(samples.map((s, i) => ({ value: s.win ? 1 : 0, weight: recencyWeight(i) })));
  const perfW = weightedMean(
    samples.flatMap((s, i) => (s.performance === null ? [] : [{ value: s.performance, weight: recencyWeight(i) }])),
  );

  // Tendencia: mitad reciente vs mitad antigua (requiere al menos 10 partidas).
  let trendScore = 0;
  if (n >= 10) {
    const half = Math.floor(n / 2);
    const recent = samples.slice(0, half);
    const old = samples.slice(half);
    const wr = (list: MatchSample[]) => mean(list.map((s) => (s.win ? 1 : 0))) ?? 0.5;
    const perf = (list: MatchSample[]) =>
      mean(list.flatMap((s) => (s.performance === null ? [] : [s.performance]))) ?? 0;
    trendScore = wr(recent) - wr(old) + (perf(recent) - perf(old));
  }
  const trend: Trend = trendScore > 0.1 ? "UP" : trendScore < -0.1 ? "DOWN" : "STABLE";

  return {
    winrateWeighted: winrateW ?? 0.5,
    performanceWeighted: perfW ?? 0,
    trendScore,
    trend,
  };
}

function buildProfile(p: PreparedPlayer, rankBaseByPuuid: Map<string, number>): PlayerProfile {
  const { samples } = p;
  const { lobbyMmr, lobbySamples } = estimateLobby(samples, rankBaseByPuuid);

  // 1) MMR base: rango > lobby > default.
  let base: number;
  let baseSource: MmrSource;
  let baseConfidence: number;
  let lobbyAdjustment = 0;

  if (p.rankBase) {
    base = p.rankBase.value;
    baseSource = p.rankBase.source;
    baseConfidence = p.rankBase.confidence;
    // Verificación con el lobby: si juega consistentemente con gente de otro nivel, corrige un poco.
    if (lobbyMmr !== null && lobbySamples >= MMR_CONFIG.lobbyMinSamples) {
      const weight =
        MMR_CONFIG.lobbyMaxWeightWhenRanked * clamp(lobbySamples / MMR_CONFIG.lobbySamplesForMaxWeight, 0, 1);
      lobbyAdjustment = (lobbyMmr - base) * weight;
    }
  } else if (lobbyMmr !== null) {
    const weight = clamp(lobbySamples / MMR_CONFIG.lobbyMinSamples, 0, 1);
    base = lobbyMmr * weight + MMR_CONFIG.defaultMmr * (1 - weight);
    baseSource = "LOBBY_ESTIMATE";
    baseConfidence = 0.3 + 0.25 * weight;
  } else {
    base = MMR_CONFIG.defaultMmr;
    baseSource = "DEFAULT";
    baseConfidence = 0.15;
  }

  // 2) Ajustes por la forma en sus partidas clasificatorias.
  const form = analyzeForm(samples);
  const sampleConfidence = clamp(samples.length / TEAM_BUILDER_CONFIG.matchesToAnalyze, 0, 1);

  const performanceRaw = form.performanceWeighted * MMR_CONFIG.performanceWeight;
  const winrateRaw = (form.winrateWeighted - 0.5) * MMR_CONFIG.winrateWeight;
  const trendRaw = clamp(
    form.trendScore * MMR_CONFIG.trendWeight,
    -MMR_CONFIG.maxTrendAdjustment,
    MMR_CONFIG.maxTrendAdjustment,
  );
  const rawTotal = performanceRaw + winrateRaw + trendRaw;
  // Escala proporcional para respetar el tope sin perder la proporción entre componentes.
  const capScale =
    Math.abs(rawTotal) > MMR_CONFIG.maxAdjustment ? MMR_CONFIG.maxAdjustment / Math.abs(rawTotal) : 1;
  const factor = capScale * sampleConfidence;

  const breakdown: MmrBreakdown = {
    base: round(base),
    baseSource,
    lobbyAdjustment: round(lobbyAdjustment),
    performanceAdjustment: round(performanceRaw * factor),
    winrateAdjustment: round(winrateRaw * factor),
    trendAdjustment: round(trendRaw * factor),
    sampleConfidence: Number(sampleConfidence.toFixed(2)),
  };

  const trueMmr = Math.max(
    0,
    breakdown.base +
      breakdown.lobbyAdjustment +
      breakdown.performanceAdjustment +
      breakdown.winrateAdjustment +
      breakdown.trendAdjustment,
  );

  const wins = samples.filter((s) => s.win).length;
  const soloQueue = samples.filter((s) => s.queueId === QUEUE_RANKED_SOLO).length;
  const stats: MatchStats = {
    analyzed: samples.length,
    soloQueue,
    flex: samples.length - soloQueue,
    wins,
    winrate: samples.length > 0 ? Number((wins / samples.length).toFixed(3)) : 0,
    avgPerformance: Number(form.performanceWeighted.toFixed(3)),
    trend: form.trend,
    lobbyMmr: lobbyMmr === null ? null : round(lobbyMmr),
    lobbySamples,
  };

  return {
    riotId: p.raw.riotId,
    puuid: p.raw.puuid,
    soloRank: p.solo,
    flexRank: p.flex,
    trueMmr,
    rankLabel: mmrToRankLabel(trueMmr),
    mmrSource: baseSource,
    mmrConfidence: Number(clamp(0.6 * baseConfidence + 0.4 * sampleConfidence, 0, 1).toFixed(2)),
    breakdown,
    stats,
    ...computeRoles(samples),
  };
}

/**
 * Calcula el True MMR de todos los jugadores. Se hace en conjunto porque la
 * estimación por lobby usa el rango de los demás jugadores de la lista.
 */
export function buildPlayerProfiles(players: RawPlayerData[]): PlayerProfile[] {
  const prepared = players.map(prepare);
  const rankBaseByPuuid = new Map<string, number>();
  for (const p of prepared) if (p.rankBase) rankBaseByPuuid.set(p.raw.puuid, p.rankBase.value);
  return prepared.map((p) => buildProfile(p, rankBaseByPuuid));
}
