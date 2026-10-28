/**
 * DTOs de la API oficial de Riot Games (solo los campos que usamos).
 * Referencia: https://developer.riotgames.com/apis
 */

/** Rutas de plataforma (League-V4, Summoner-V4...). */
export type PlatformId =
  | "br1"
  | "eun1"
  | "euw1"
  | "jp1"
  | "kr"
  | "la1"
  | "la2"
  | "me1"
  | "na1"
  | "oc1"
  | "ru"
  | "sg2"
  | "tr1"
  | "tw2"
  | "vn2";

/** Rutas regionales (Account-V1, Match-V5). */
export type RegionalRoute = "americas" | "europe" | "asia" | "sea";

// ---------------------------------------------------------------------------
// Account-V1
// ---------------------------------------------------------------------------

export interface AccountDto {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

// ---------------------------------------------------------------------------
// Summoner-V4
// ---------------------------------------------------------------------------

export interface SummonerDto {
  puuid: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

// ---------------------------------------------------------------------------
// League-V4
// ---------------------------------------------------------------------------

export type QueueType = "RANKED_SOLO_5x5" | "RANKED_FLEX_SR" | (string & {});

export type Tier =
  | "IRON"
  | "BRONZE"
  | "SILVER"
  | "GOLD"
  | "PLATINUM"
  | "EMERALD"
  | "DIAMOND"
  | "MASTER"
  | "GRANDMASTER"
  | "CHALLENGER";

export type Division = "I" | "II" | "III" | "IV";

export interface MiniSeriesDto {
  losses: number;
  progress: string;
  target: number;
  wins: number;
}

export interface LeagueEntryDto {
  leagueId: string;
  puuid: string;
  summonerId?: string;
  queueType: QueueType;
  tier: Tier;
  rank: Division;
  leaguePoints: number;
  wins: number;
  losses: number;
  hotStreak: boolean;
  veteran: boolean;
  freshBlood: boolean;
  inactive: boolean;
  miniSeries?: MiniSeriesDto;
}

// ---------------------------------------------------------------------------
// Match-V5
// ---------------------------------------------------------------------------

/** Valores de `teamPosition` / `individualPosition`. "" o "Invalid" cuando Riot no lo determina. */
export type RiotPosition = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY" | "" | "Invalid";

export interface ParticipantDto {
  puuid: string;
  riotIdGameName?: string;
  riotIdTagline?: string;
  summonerLevel: number;
  teamId: 100 | 200;
  teamPosition: RiotPosition;
  individualPosition: RiotPosition;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  totalMinionsKilled: number;
  neutralMinionsKilled: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  visionScore: number;
  /** true en remakes. */
  gameEndedInEarlySurrender?: boolean;
}

export interface MatchMetadataDto {
  dataVersion: string;
  matchId: string;
  /** PUUIDs de los 10 participantes. */
  participants: string[];
}

export interface MatchInfoDto {
  gameCreation: number;
  /** Segundos si existe `gameEndTimestamp`; en partidas antiguas (< parche 11.20) viene en milisegundos. */
  gameDuration: number;
  gameEndTimestamp?: number;
  gameMode: string;
  gameType: string;
  mapId: number;
  platformId: string;
  /** 420 = Solo/Duo, 440 = Flex, 400 = Normal Draft, 430 = Blind, 490 = Quickplay, 450 = ARAM... */
  queueId: number;
  participants: ParticipantDto[];
}

export interface MatchDto {
  metadata: MatchMetadataDto;
  info: MatchInfoDto;
}

/** Match-V5 `/ids` devuelve un array de IDs (ej. "LA1_1234567890"). */
export type MatchIdsDto = string[];

export const QUEUE_RANKED_SOLO = 420;
export const QUEUE_RANKED_FLEX = 440;
export const RANKED_QUEUE_IDS: readonly number[] = [QUEUE_RANKED_SOLO, QUEUE_RANKED_FLEX];
