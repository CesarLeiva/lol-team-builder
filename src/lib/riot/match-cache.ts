import { promises as fs } from "node:fs";
import path from "node:path";
import type { MatchDto } from "@/types/riot";

/**
 * Caché de partidas (memoria + disco). Una partida terminada nunca cambia, así
 * que se puede guardar indefinidamente. Esto ahorra cuota cuando:
 * - Varios jugadores de la lista jugaron la misma partida (dúos / flex).
 * - Se vuelve a armar equipos con los mismos jugadores.
 * Además deduplica peticiones simultáneas a la misma partida.
 *
 * Desactivar disco con RIOT_DISK_CACHE=false (ej. en entornos de solo lectura).
 */
class MatchCache {
  private readonly memory = new Map<string, MatchDto>();
  private readonly inflight = new Map<string, Promise<MatchDto>>();
  private readonly maxMemoryEntries = 5_000;
  private readonly dir = process.env.RIOT_CACHE_DIR ?? path.join(process.cwd(), ".cache", "riot-matches");
  private diskEnabled = process.env.RIOT_DISK_CACHE !== "false";

  async getOrLoad(matchId: string, loader: () => Promise<MatchDto>): Promise<MatchDto> {
    const cached = this.memory.get(matchId);
    if (cached) return cached;

    const pending = this.inflight.get(matchId);
    if (pending) return pending;

    const promise = (async () => {
      const fromDisk = await this.readDisk(matchId);
      if (fromDisk) return fromDisk;
      const match = trimMatch(await loader());
      await this.writeDisk(matchId, match);
      return match;
    })();

    this.inflight.set(matchId, promise);
    try {
      const match = await promise;
      this.remember(matchId, match);
      return match;
    } finally {
      this.inflight.delete(matchId);
    }
  }

  private remember(matchId: string, match: MatchDto): void {
    this.memory.set(matchId, match);
    if (this.memory.size > this.maxMemoryEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest !== undefined) this.memory.delete(oldest);
    }
  }

  private fileFor(matchId: string): string {
    return path.join(this.dir, `${matchId.replace(/[^A-Za-z0-9_-]/g, "_")}.json`);
  }

  private async readDisk(matchId: string): Promise<MatchDto | null> {
    if (!this.diskEnabled) return null;
    try {
      return JSON.parse(await fs.readFile(this.fileFor(matchId), "utf8")) as MatchDto;
    } catch {
      return null;
    }
  }

  private async writeDisk(matchId: string, match: MatchDto): Promise<void> {
    if (!this.diskEnabled) return;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(this.fileFor(matchId), JSON.stringify(match));
    } catch (error) {
      console.warn("[match-cache] No se pudo escribir en disco; se usará solo memoria.", error);
      this.diskEnabled = false;
    }
  }
}

/** Conserva solo los campos tipados en MatchDto (~3 KB vs ~40 KB de la respuesta completa). */
export function trimMatch(match: MatchDto): MatchDto {
  const { metadata, info } = match;
  return {
    metadata: { dataVersion: metadata.dataVersion, matchId: metadata.matchId, participants: metadata.participants },
    info: {
      gameCreation: info.gameCreation,
      gameDuration: info.gameDuration,
      gameEndTimestamp: info.gameEndTimestamp,
      gameMode: info.gameMode,
      gameType: info.gameType,
      mapId: info.mapId,
      platformId: info.platformId,
      queueId: info.queueId,
      participants: info.participants.map((p) => ({
        puuid: p.puuid,
        riotIdGameName: p.riotIdGameName,
        riotIdTagline: p.riotIdTagline,
        summonerLevel: p.summonerLevel,
        teamId: p.teamId,
        teamPosition: p.teamPosition,
        individualPosition: p.individualPosition,
        championName: p.championName,
        win: p.win,
        kills: p.kills,
        deaths: p.deaths,
        assists: p.assists,
        totalMinionsKilled: p.totalMinionsKilled,
        neutralMinionsKilled: p.neutralMinionsKilled,
        goldEarned: p.goldEarned,
        totalDamageDealtToChampions: p.totalDamageDealtToChampions,
        visionScore: p.visionScore,
        gameEndedInEarlySurrender: p.gameEndedInEarlySurrender,
      })),
    },
  };
}

const globalForCache = globalThis as typeof globalThis & { __riotMatchCache?: MatchCache };
export const matchCache: MatchCache = (globalForCache.__riotMatchCache ??= new MatchCache());
