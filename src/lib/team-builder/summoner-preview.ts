import type { PlatformId } from "@/types/riot";
import type { RiotId, SummonerPreview } from "@/types/team-builder";
import { communityDragonIconUrl, profileIconUrl } from "@/lib/riot/ddragon";
import { getAccountByRiotId, getLeagueEntries, getSummonerByPuuid } from "@/lib/riot/riot-api";
import { toRankInfo } from "./mmr";

/** Account-V1 + Summoner-V4 + League-V4 (3 peticiones; luego quedan en caché). */
export async function getSummonerPreview(
  platform: PlatformId,
  riotId: RiotId,
  signal?: AbortSignal,
): Promise<SummonerPreview> {
  const account = await getAccountByRiotId(platform, riotId, signal);
  const [summoner, entries] = await Promise.all([
    getSummonerByPuuid(platform, account.puuid, signal),
    getLeagueEntries(platform, account.puuid, signal),
  ]);

  return {
    riotId: { gameName: account.gameName ?? riotId.gameName, tagLine: account.tagLine ?? riotId.tagLine },
    puuid: account.puuid,
    profileIconId: summoner.profileIconId,
    iconUrl: await profileIconUrl(summoner.profileIconId),
    iconFallbackUrl: communityDragonIconUrl(summoner.profileIconId),
    summonerLevel: summoner.summonerLevel,
    soloRank: toRankInfo(entries.find((e) => e.queueType === "RANKED_SOLO_5x5"), "SOLO"),
    flexRank: toRankInfo(entries.find((e) => e.queueType === "RANKED_FLEX_SR"), "FLEX"),
  };
}
