import type { Division, PlatformId, Tier } from "./riot";

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"] as const;
export type Role = (typeof ROLES)[number];

export const TEAM_SIZE = ROLES.length;

export interface RiotId {
  gameName: string;
  tagLine: string;
}

export interface InvalidEntry {
  raw: string;
  reason: string;
}

interface ParseInputBase {
  players: RiotId[];
  duplicates: string[];
  invalid: InvalidEntry[];
}

export type ParseInputResult =
  | (ParseInputBase & { ok: true })
  | (ParseInputBase & { ok: false; error: string });

// ---------------------------------------------------------------------------
// Perfil del jugador / MMR
// ---------------------------------------------------------------------------

export interface RankInfo {
  queue: "SOLO" | "FLEX";
  tier: Tier;
  /** Master+ no tiene división real; Riot devuelve "I". */
  division: Division;
  leaguePoints: number;
  wins: number;
  losses: number;
}

/**
 * Origen del MMR base (antes de ajustes por rendimiento):
 * - RANKED_SOLO: rango Solo/Duo (mezclado con Flex si tiene pocas partidas en Solo).
 * - RANKED_FLEX: solo tiene rango Flex.
 * - LOBBY_ESTIMATE: sin rango; estimado por el nivel de los lobbys donde juega.
 * - DEFAULT: sin datos suficientes, valor base.
 */
export type MmrSource = "RANKED_SOLO" | "RANKED_FLEX" | "LOBBY_ESTIMATE" | "DEFAULT";

export type Trend = "UP" | "DOWN" | "STABLE";

export type RoleCounts = Record<Role, number>;

export interface MatchStats {
  /** Partidas clasificatorias válidas analizadas (sin remakes). */
  analyzed: number;
  soloQueue: number;
  flex: number;
  wins: number;
  winrate: number;
  /** -1..1: rendimiento promedio contra su rival de línea (0 = parejo). */
  avgPerformance: number;
  trend: Trend;
  /** MMR promedio de los jugadores conocidos con los que compartió lobby. */
  lobbyMmr: number | null;
  lobbySamples: number;
}

export interface MmrBreakdown {
  base: number;
  baseSource: MmrSource;
  /** Corrección aplicada por el nivel de los lobbys (puede ser 0). */
  lobbyAdjustment: number;
  performanceAdjustment: number;
  winrateAdjustment: number;
  trendAdjustment: number;
  /** 0..1, factor aplicado a los ajustes según cuántas partidas hay. */
  sampleConfidence: number;
}

export interface PlayerProfile {
  riotId: RiotId;
  puuid: string;
  soloRank: RankInfo | null;
  flexRank: RankInfo | null;
  trueMmr: number;
  /** Ej. "Oro II" (equivalente aproximado del True MMR). */
  rankLabel: string;
  mmrSource: MmrSource;
  /** 0..1, qué tan confiable es el MMR. */
  mmrConfidence: number;
  breakdown: MmrBreakdown;
  stats: MatchStats;
  mainRole: Role | null;
  secondaryRole: Role | null;
  /** Roles jugados ordenados de más a menos frecuente. */
  rolePreference: Role[];
  roleCounts: RoleCounts;
}

export interface PlayerFetchError {
  riotId: RiotId;
  status?: number;
  message: string;
}

/** Vista previa del invocador (al buscarlo antes de agregarlo a la lista). */
export interface SummonerPreview {
  /** Con el uso de mayúsculas oficial de Riot. */
  riotId: RiotId;
  puuid: string;
  profileIconId: number;
  iconUrl: string;
  /** URL alternativa (CommunityDragon) si Data Dragon falla. */
  iconFallbackUrl: string;
  summonerLevel: number;
  soloRank: RankInfo | null;
  flexRank: RankInfo | null;
}

// ---------------------------------------------------------------------------
// Equipos
// ---------------------------------------------------------------------------

/**
 * - MAIN: su rol más jugado.
 * - SECONDARY: su segundo rol (≥15% de sus partidas).
 * - PLAYED: lo ha jugado alguna vez.
 * - OFF_ROLE: nunca lo jugó en las partidas analizadas.
 * - FILL: sin datos de roles.
 */
export type RoleFit = "MAIN" | "SECONDARY" | "PLAYED" | "OFF_ROLE" | "FILL";

export interface TeamSlot {
  role: Role;
  player: PlayerProfile;
  fit: RoleFit;
  offRole: boolean;
  /** True MMR menos la penalización por jugar fuera de rol. Es lo que se balancea. */
  effectiveMmr: number;
}

export interface Team {
  id: number;
  name: string;
  /** Ordenados TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY. */
  slots: TeamSlot[];
  totalMmr: number;
  /** Promedio del MMR efectivo (con penalización fuera de rol). */
  averageMmr: number;
  /** Promedio del True MMR puro. */
  averageTrueMmr: number;
}

export interface TeamBuildResult {
  teams: Team[];
  /** Diferencia entre el equipo con mayor y menor MMR promedio. */
  mmrSpread: number;
  offRoleCount: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// API interna (Route Handler) + eventos de progreso para streaming (NDJSON)
// ---------------------------------------------------------------------------

export interface BuildTeamsRequest {
  input: string;
  platform: PlatformId;
}

export type RateLimitWaitReason = "window" | "retry-after";

export type BuildPhase = "accounts" | "ranks" | "matches" | "analysis" | "matchmaking";

export type BuildTeamsEvent =
  | { type: "start"; totalPlayers: number; estimatedRequests: number; estimatedMs: number }
  | { type: "phase"; phase: BuildPhase; message: string }
  | {
      type: "progress";
      phase: BuildPhase;
      current: number;
      total: number;
      player: string;
      matchesFetched?: number;
      matchesTotal?: number;
      /** Avance global (todas las peticiones de partidas). */
      overallDone?: number;
      overallTotal?: number;
      /** Tiempo restante estimado (peor caso, sin caché). */
      etaMs?: number;
    }
  | { type: "rate-limit-wait"; waitMs: number; reason: RateLimitWaitReason }
  | { type: "done"; result: TeamBuildResult }
  | { type: "error"; message: string; errors?: PlayerFetchError[] };
