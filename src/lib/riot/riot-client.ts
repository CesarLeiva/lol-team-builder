import type { PlatformId, RegionalRoute } from "@/types/riot";
import { riotRateLimiter, RIOT_PERSONAL_KEY_LIMITS, type RateLimiter } from "./rate-limiter";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** Plataforma -> ruta regional para Match-V5. */
export const PLATFORM_TO_MATCH_REGION: Record<PlatformId, RegionalRoute> = {
  br1: "americas",
  la1: "americas",
  la2: "americas",
  na1: "americas",
  eun1: "europe",
  euw1: "europe",
  me1: "europe",
  ru: "europe",
  tr1: "europe",
  jp1: "asia",
  kr: "asia",
  oc1: "sea",
  sg2: "sea",
  tw2: "sea",
  vn2: "sea",
};

/** Account-V1 no tiene cluster "sea": esas cuentas se consultan en "asia". */
export function accountRegionFor(platform: PlatformId): Exclude<RegionalRoute, "sea"> {
  const region = PLATFORM_TO_MATCH_REGION[platform];
  return region === "sea" ? "asia" : region;
}

const enc = encodeURIComponent;

export interface MatchIdsQuery {
  start?: number;
  /** Máximo 100 por llamada. */
  count?: number;
  /** "ranked" incluye Solo/Duo (420) y Flex (440). */
  type?: "ranked" | "normal" | "tourney" | "tutorial";
  queue?: number;
}

export const riotEndpoints = {
  accountByRiotId: (platform: PlatformId, gameName: string, tagLine: string) =>
    `https://${accountRegionFor(platform)}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${enc(gameName)}/${enc(tagLine)}`,

  leagueEntriesByPuuid: (platform: PlatformId, puuid: string) =>
    `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${enc(puuid)}`,

  matchIdsByPuuid: (platform: PlatformId, puuid: string, query: MatchIdsQuery = {}) => {
    const params = new URLSearchParams({ start: String(query.start ?? 0), count: String(query.count ?? 20) });
    if (query.type) params.set("type", query.type);
    if (query.queue !== undefined) params.set("queue", String(query.queue));
    return `https://${PLATFORM_TO_MATCH_REGION[platform]}.api.riotgames.com/lol/match/v5/matches/by-puuid/${enc(puuid)}/ids?${params}`;
  },

  matchById: (platform: PlatformId, matchId: string) =>
    `https://${PLATFORM_TO_MATCH_REGION[platform]}.api.riotgames.com/lol/match/v5/matches/${enc(matchId)}`,

  summonerByPuuid: (platform: PlatformId, puuid: string) =>
    `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${enc(puuid)}`,
};

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export class RiotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "RiotApiError";
  }
}

function describeStatus(status: number): string {
  switch (status) {
    case 400:
      return "Petición inválida";
    case 401:
      return "API key desconocida o expirada (las Development keys caducan cada 24 h; genera una nueva)";
    case 403:
      return "API key inválida o sin permisos para este endpoint";
    case 404:
      return "No encontrado";
    case 429:
      return "Rate limit excedido";
    default:
      return status >= 500 ? "Error del servidor de Riot" : `Error HTTP ${status}`;
  }
}

// ---------------------------------------------------------------------------
// Fetch con rate limit + reintentos
// ---------------------------------------------------------------------------

export interface RiotFetchOptions {
  signal?: AbortSignal;
  /** Reintentos ante 429 / 5xx / errores de red. */
  maxRetries?: number;
  limiter?: RateLimiter;
}

const DEFAULT_RETRY_AFTER_MS = 10_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function getApiKey(): string {
  const key = process.env.RIOT_API_KEY;
  if (!key) throw new Error("RIOT_API_KEY no está definida (configúrala en .env.local)");
  return key;
}

/**
 * GET a la API de Riot. Cada intento (incluidos los reintentos) pasa por la
 * cola del RateLimiter, por lo que cuenta contra el presupuesto de la key.
 */
export async function riotFetch<T>(url: string, options: RiotFetchOptions = {}): Promise<T> {
  const { signal, maxRetries = 4, limiter = riotRateLimiter } = options;
  const apiKey = getApiKey();

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await limiter.schedule(
        () => fetch(url, { headers: { "X-Riot-Token": apiKey }, signal, cache: "no-store" }),
        signal,
      );
    } catch (error) {
      if (signal?.aborted || attempt >= maxRetries) throw error;
      await sleep(backoffMs(attempt), signal);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfterSec = Number(response.headers.get("Retry-After"));
      const waitMs =
        Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_RETRY_AFTER_MS;
      // Bloquea la cola completa: si una petición recibió 429, las demás también lo recibirían.
      limiter.pauseFor(waitMs);
      continue;
    }

    if (response.status >= 500 && attempt < maxRetries) {
      await sleep(backoffMs(attempt), signal);
      continue;
    }

    throw new RiotApiError(describeStatus(response.status), response.status, url);
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1_000 * 2 ** attempt, 15_000) + Math.floor(Math.random() * 250);
}

// ---------------------------------------------------------------------------
// Estimaciones para la UI
// ---------------------------------------------------------------------------

/** Por jugador: Account (1) + League (1) + Match IDs (1) + N partidas. Peor caso, sin caché. */
export function estimateRequests(playerCount: number, matchesPerPlayer: number): number {
  return playerCount * (3 + matchesPerPlayer);
}

/** Estimación (peor caso, sin caché) del tiempo total según los límites configurados. */
export function estimateProcessingTimeMs(totalRequests: number): number {
  const [perSecond, longWindow] = RIOT_PERSONAL_KEY_LIMITS;
  if (totalRequests <= 0) return 0;
  const fullChunks = Math.floor((totalRequests - 1) / longWindow.maxRequests);
  const lastChunk = totalRequests - fullChunks * longWindow.maxRequests;
  return fullChunks * longWindow.windowMs + Math.ceil(lastChunk / perSecond.maxRequests) * perSecond.windowMs;
}
