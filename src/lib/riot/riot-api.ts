import type { AccountDto, LeagueEntryDto, MatchDto, MatchIdsDto, PlatformId, SummonerDto } from "@/types/riot";
import type { RiotId } from "@/types/team-builder";
import { matchCache } from "./match-cache";
import { accountRegionFor, riotEndpoints, riotFetch } from "./riot-client";
import { sharedCache } from "./ttl-cache";

/**
 * Cuentas y rangos se guardan en caché un tiempo: así, buscar a un jugador
 * para la vista previa y luego armar los equipos no gasta peticiones dos veces.
 */
const accountCache = sharedCache<AccountDto>("riot-account", 60 * 60_000);
const leagueCache = sharedCache<LeagueEntryDto[]>("riot-league", 10 * 60_000);
const summonerCache = sharedCache<SummonerDto>("riot-summoner", 10 * 60_000);

export function getAccountByRiotId(platform: PlatformId, riotId: RiotId, signal?: AbortSignal) {
  const key = `${accountRegionFor(platform)}:${riotId.gameName}#${riotId.tagLine}`.toLocaleLowerCase();
  return accountCache.getOrLoad(key, () =>
    riotFetch<AccountDto>(riotEndpoints.accountByRiotId(platform, riotId.gameName, riotId.tagLine), { signal }),
  );
}

export function getLeagueEntries(platform: PlatformId, puuid: string, signal?: AbortSignal) {
  return leagueCache.getOrLoad(`${platform}:${puuid}`, () =>
    riotFetch<LeagueEntryDto[]>(riotEndpoints.leagueEntriesByPuuid(platform, puuid), { signal }),
  );
}

export function getSummonerByPuuid(platform: PlatformId, puuid: string, signal?: AbortSignal) {
  return summonerCache.getOrLoad(`${platform}:${puuid}`, () =>
    riotFetch<SummonerDto>(riotEndpoints.summonerByPuuid(platform, puuid), { signal }),
  );
}

/** IDs de las últimas `count` partidas clasificatorias (Solo/Duo + Flex), de más reciente a más antigua. */
export function getRankedMatchIds(platform: PlatformId, puuid: string, count: number, signal?: AbortSignal) {
  return riotFetch<MatchIdsDto>(riotEndpoints.matchIdsByPuuid(platform, puuid, { type: "ranked", count }), { signal });
}

/** Partida desde caché si existe; si no, 1 petición a Match-V5. */
export function getMatch(platform: PlatformId, matchId: string, signal?: AbortSignal): Promise<MatchDto> {
  return matchCache.getOrLoad(matchId, () => riotFetch<MatchDto>(riotEndpoints.matchById(platform, matchId), { signal }));
}
