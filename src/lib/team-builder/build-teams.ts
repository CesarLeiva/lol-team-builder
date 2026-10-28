import type { MatchDto, PlatformId } from "@/types/riot";
import type { BuildTeamsEvent, PlayerFetchError, RiotId, TeamBuildResult } from "@/types/team-builder";
import { riotRateLimiter } from "@/lib/riot/rate-limiter";
import { getAccountByRiotId, getLeagueEntries, getMatch, getRankedMatchIds } from "@/lib/riot/riot-api";
import { estimateProcessingTimeMs, estimateRequests, RiotApiError } from "@/lib/riot/riot-client";
import { TEAM_BUILDER_CONFIG } from "./config";
import { buildBalancedTeams } from "./matchmaking";
import { buildPlayerProfiles, type RawPlayerData } from "./mmr";
import { formatRiotId, parseSummonerInput } from "./parse-input";

export class TeamBuilderError extends Error {
  constructor(
    message: string,
    readonly errors: PlayerFetchError[] = [],
  ) {
    super(message);
    this.name = "TeamBuilderError";
  }
}

export interface BuildTeamsOptions {
  platform: PlatformId;
  signal?: AbortSignal;
  onEvent?: (event: BuildTeamsEvent) => void;
  matchesPerPlayer?: number;
}

function toFetchError(riotId: RiotId, reason: unknown): PlayerFetchError {
  if (reason instanceof RiotApiError) {
    return {
      riotId,
      status: reason.status,
      message: reason.status === 404 ? `No existe la cuenta ${formatRiotId(riotId)}` : reason.message,
    };
  }
  return { riotId, message: reason instanceof Error ? reason.message : String(reason) };
}

/**
 * Flujo completo:
 * 1. Valida la entrada.
 * 2. Resuelve todas las cuentas primero (barato) para fallar rápido si hay un nombre mal escrito.
 * 3. Rango + IDs de las últimas 50 partidas clasificatorias.
 * 4. Descarga las partidas (lo caro; con caché y dedupe).
 * 5. Calcula True MMR y arma los equipos.
 */
export async function buildTeams(input: string, options: BuildTeamsOptions): Promise<TeamBuildResult> {
  const { platform, signal, onEvent = () => {}, matchesPerPlayer = TEAM_BUILDER_CONFIG.matchesToAnalyze } = options;

  const parsed = parseSummonerInput(input);
  if (!parsed.ok) {
    const detail = parsed.invalid.map((i) => `"${i.raw}": ${i.reason}`).join("; ");
    throw new TeamBuilderError(detail ? `${parsed.error} ${detail}` : parsed.error);
  }

  const players = parsed.players;
  const total = players.length;
  const estimatedRequests = estimateRequests(total, matchesPerPlayer);
  onEvent({
    type: "start",
    totalPlayers: total,
    estimatedRequests,
    estimatedMs: estimateProcessingTimeMs(estimatedRequests),
  });

  const unsubscribe = riotRateLimiter.onWait((info) =>
    onEvent({ type: "rate-limit-wait", waitMs: Math.round(info.waitMs), reason: info.reason }),
  );

  try {
    // --- 1. Cuentas -------------------------------------------------------
    onEvent({ type: "phase", phase: "accounts", message: "Buscando cuentas de Riot..." });
    let accountsDone = 0;
    const accountResults = await Promise.allSettled(
      players.map(async (riotId) => {
        const account = await getAccountByRiotId(platform, riotId, signal);
        onEvent({ type: "progress", phase: "accounts", current: ++accountsDone, total, player: formatRiotId(riotId) });
        return account;
      }),
    );
    signal?.throwIfAborted();

    const accountErrors = accountResults.flatMap((r, i) =>
      r.status === "rejected" ? [toFetchError(players[i], r.reason)] : [],
    );
    const authError = accountErrors.find((e) => e.status === 401 || e.status === 403);
    if (authError) throw new TeamBuilderError(authError.message);
    if (accountErrors.length > 0) {
      throw new TeamBuilderError(
        `No se pudieron obtener ${accountErrors.length} cuenta(s). Corrige los nombres e inténtalo de nuevo.`,
        accountErrors,
      );
    }
    const puuids = accountResults.map((r) => (r as PromiseFulfilledResult<{ puuid: string }>).value.puuid);
    if (new Set(puuids).size !== puuids.length) {
      throw new TeamBuilderError("Hay dos nombres que pertenecen a la misma cuenta.");
    }

    // --- 2. Rangos + IDs de partidas -------------------------------------
    onEvent({ type: "phase", phase: "ranks", message: "Obteniendo rangos e historial clasificatorio..." });
    let ranksDone = 0;
    const meta = await Promise.all(
      players.map(async (riotId, i) => {
        const [leagueEntries, matchIds] = await Promise.all([
          getLeagueEntries(platform, puuids[i], signal),
          getRankedMatchIds(platform, puuids[i], matchesPerPlayer, signal),
        ]);
        onEvent({ type: "progress", phase: "ranks", current: ++ranksDone, total, player: formatRiotId(riotId) });
        return { leagueEntries, matchIds };
      }),
    );

    // --- 3. Partidas ------------------------------------------------------
    onEvent({
      type: "phase",
      phase: "matches",
      message: `Analizando hasta ${matchesPerPlayer} partidas clasificatorias por jugador...`,
    });
    const fetched = players.map(() => 0);
    const overallTotal = meta.reduce((sum, m) => sum + m.matchIds.length, 0);
    let overallDone = 0;
    const reportMatches = () => {
      // Se reporta el primer jugador que aún no termina (la cola es FIFO, así que avanza en orden).
      let idx = fetched.findIndex((count, i) => count < meta[i].matchIds.length);
      if (idx === -1) idx = total - 1;
      onEvent({
        type: "progress",
        phase: "matches",
        current: idx + 1,
        total,
        player: formatRiotId(players[idx]),
        matchesFetched: fetched[idx],
        matchesTotal: meta[idx].matchIds.length,
        overallDone,
        overallTotal,
        etaMs: estimateProcessingTimeMs(overallTotal - overallDone),
      });
    };
    reportMatches();

    const matchesByPlayer = await Promise.all(
      players.map(async (_, i) => {
        const results = await Promise.all(
          meta[i].matchIds.map(async (matchId): Promise<MatchDto | null> => {
            try {
              return await getMatch(platform, matchId, signal);
            } catch (error) {
              // Partidas borradas/inaccesibles se omiten; cualquier otro error aborta.
              if (error instanceof RiotApiError && error.status === 404) return null;
              throw error;
            } finally {
              fetched[i]++;
              overallDone++;
              reportMatches();
            }
          }),
        );
        return results.filter((m): m is MatchDto => m !== null);
      }),
    );

    // --- 4. True MMR -------------------------------------------------------
    onEvent({ type: "phase", phase: "analysis", message: "Calculando True MMR..." });
    const raw: RawPlayerData[] = players.map((riotId, i) => ({
      riotId,
      puuid: puuids[i],
      leagueEntries: meta[i].leagueEntries,
      matches: matchesByPlayer[i],
    }));
    const profiles = buildPlayerProfiles(raw);

    const warnings: string[] = [];
    if (parsed.duplicates.length > 0) warnings.push(`Duplicados ignorados: ${parsed.duplicates.join(", ")}`);
    for (const p of profiles) {
      const name = formatRiotId(p.riotId);
      if (p.stats.analyzed === 0) {
        warnings.push(`${name}: sin partidas clasificatorias; su rol se asignará como relleno.`);
      } else if (p.stats.analyzed < 10) {
        warnings.push(`${name}: solo ${p.stats.analyzed} partidas clasificatorias; MMR poco confiable.`);
      }
      if (p.mmrSource === "DEFAULT") warnings.push(`${name}: sin rango ni datos de lobby; se usó MMR por defecto.`);
    }

    // --- 5. Equipos --------------------------------------------------------
    onEvent({ type: "phase", phase: "matchmaking", message: "Armando equipos balanceados..." });
    const result = { ...buildBalancedTeams(profiles), warnings };
    onEvent({ type: "done", result });
    return result;
  } finally {
    unsubscribe();
  }
}
