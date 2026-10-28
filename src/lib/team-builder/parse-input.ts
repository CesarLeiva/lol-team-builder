import { TEAM_SIZE, type InvalidEntry, type ParseInputResult, type RiotId } from "@/types/team-builder";
import { TEAM_BUILDER_CONFIG } from "./config";

/** Riot ID: gameName 3-16 caracteres, tagLine 3-5 alfanuméricos. */
const GAME_NAME_RE = /^[\p{L}\p{N} _.]{3,16}$/u;
const TAG_LINE_RE = /^[\p{L}\p{N}]{3,5}$/u;

export function formatRiotId(id: RiotId): string {
  return `${id.gameName}#${id.tagLine}`;
}

/** Riot IDs no distinguen mayúsculas/minúsculas. */
export function riotIdKey(id: RiotId): string {
  return formatRiotId(id).toLocaleLowerCase();
}

export function parseRiotId(raw: string): RiotId | InvalidEntry {
  const value = raw.trim().replace(/\s+/g, " ");
  const hashIndex = value.lastIndexOf("#");
  if (hashIndex === -1) return { raw, reason: "Falta el TagLine (ej. Nombre#LAN)" };

  const gameName = value.slice(0, hashIndex).trim();
  const tagLine = value.slice(hashIndex + 1).trim();

  if (!GAME_NAME_RE.test(gameName)) return { raw, reason: "El nombre debe tener entre 3 y 16 caracteres" };
  if (!TAG_LINE_RE.test(tagLine)) return { raw, reason: "El TagLine debe tener entre 3 y 5 letras o números" };
  return { gameName, tagLine };
}

/**
 * Convierte "Faker#KR1, Caps#EUW , faker#kr1" en Riot IDs únicos y valida
 * que formen equipos completos de 5.
 */
export function parseSummonerInput(input: string): ParseInputResult {
  const players: RiotId[] = [];
  const duplicates: string[] = [];
  const invalid: InvalidEntry[] = [];
  const seen = new Set<string>();

  for (const raw of input.split(/[,\n\r]+/)) {
    if (!raw.trim()) continue;
    const parsed = parseRiotId(raw);
    if ("reason" in parsed) {
      invalid.push({ ...parsed, raw: parsed.raw.trim() });
      continue;
    }
    const key = riotIdKey(parsed);
    if (seen.has(key)) {
      duplicates.push(formatRiotId(parsed));
      continue;
    }
    seen.add(key);
    players.push(parsed);
  }

  const base = { players, duplicates, invalid };
  const { minPlayers, maxPlayers } = TEAM_BUILDER_CONFIG;

  if (invalid.length > 0) {
    return { ...base, ok: false, error: `Hay ${invalid.length} invocador(es) con formato inválido.` };
  }
  if (players.length < minPlayers) {
    return { ...base, ok: false, error: `Se necesitan al menos ${minPlayers} jugadores únicos (hay ${players.length}).` };
  }
  if (players.length > maxPlayers) {
    return { ...base, ok: false, error: `El máximo es ${maxPlayers} jugadores (hay ${players.length}).` };
  }
  const remainder = players.length % TEAM_SIZE;
  if (remainder !== 0) {
    return {
      ...base,
      ok: false,
      error: `Hay ${players.length} jugadores únicos; debe ser múltiplo de ${TEAM_SIZE}. Agrega ${TEAM_SIZE - remainder} o quita ${remainder}.`,
    };
  }
  return { ...base, ok: true };
}
