import { sharedCache } from "./ttl-cache";

/**
 * Íconos de invocador desde Data Dragon (CDN estático de Riot; no consume
 * cuota de la API). La versión se consulta una vez cada 6 h.
 */
const versionCache = sharedCache<string>("ddragon-version", 6 * 60 * 60_000);

async function latestVersion(): Promise<string | null> {
  try {
    return await versionCache.getOrLoad("latest", async () => {
      const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`Data Dragon ${res.status}`);
      const versions = (await res.json()) as string[];
      if (!versions[0]) throw new Error("Data Dragon sin versiones");
      return versions[0];
    });
  } catch {
    return null;
  }
}

export function communityDragonIconUrl(profileIconId: number): string {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${profileIconId}.jpg`;
}

export async function profileIconUrl(profileIconId: number): Promise<string> {
  const version = await latestVersion();
  return version
    ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${profileIconId}.png`
    : communityDragonIconUrl(profileIconId);
}
