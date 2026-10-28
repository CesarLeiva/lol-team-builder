import type { PlatformId } from "@/types/riot";
import type { BuildStatus } from "./use-build-teams";
import type { RosterEntry } from "./use-roster";

export const SESSION_KEY = "lol-team-builder.session.v1";

export interface BrowserSession {
  version: 1;
  platform: PlatformId;
  entries: RosterEntry[];
  draft: string;
  result: Extract<BuildStatus, { state: "done" }> | null;
}

export const EMPTY_SESSION: BrowserSession = {
  version: 1,
  platform: "la1",
  entries: [],
  draft: "",
  result: null,
};

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matches(value: unknown, template: unknown): boolean {
  if (template === null) return value === null || object(value);
  if (Array.isArray(template)) {
    return Array.isArray(value) && value.every((item) => matches(item, template[0]));
  }
  if (object(template)) {
    return object(value) && Object.entries(template).every(([key, field]) => matches(value[key], field));
  }
  return typeof value === typeof template && (typeof value !== "number" || Number.isFinite(value));
}

const idShape = { gameName: "", tagLine: "" };
const rankShape = { queue: "", tier: "", division: "", leaguePoints: 0, wins: 0, losses: 0 };
const profileShape = {
  riotId: idShape, puuid: "", profileIconId: 0, iconUrl: "", iconFallbackUrl: "", summonerLevel: 0,
};
const playerShape = {
  riotId: idShape, puuid: "", trueMmr: 0, rankLabel: "", mmrSource: "", mmrConfidence: 0,
  breakdown: { base: 0, baseSource: "", lobbyAdjustment: 0, performanceAdjustment: 0,
    winrateAdjustment: 0, trendAdjustment: 0, sampleConfidence: 0 },
  stats: { analyzed: 0, soloQueue: 0, flex: 0, wins: 0, winrate: 0, avgPerformance: 0,
    trend: "", lobbySamples: 0 },
  roleCounts: { TOP: 0, JUNGLE: 0, MIDDLE: 0, BOTTOM: 0, UTILITY: 0 },
  rolePreference: [""],
};
const platforms = ["br1", "eun1", "euw1", "jp1", "kr", "la1", "la2", "me1", "na1",
  "oc1", "ru", "sg2", "tr1", "tw2", "vn2"];
const tiers = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND",
  "MASTER", "GRANDMASTER", "CHALLENGER"];
const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

function validRanks(value: Record<string, unknown>): boolean {
  return ["soloRank", "flexRank"].every((key) => {
    const rank = value[key];
    return rank === null || (object(rank) && matches(rank, rankShape) &&
      tiers.includes(String(rank.tier)) && ["I", "II", "III", "IV"].includes(String(rank.division)));
  });
}

function assertSession(value: unknown): asserts value is BrowserSession {
  if (!object(value) || value.version !== 1 || !platforms.includes(String(value.platform)) ||
      typeof value.draft !== "string" || !Array.isArray(value.entries) || value.entries.length > 50 ||
      !value.entries.every((entry) => object(entry) && entry.status === "ready" &&
        typeof entry.key === "string" && matches(entry.riotId, idShape) &&
        object(entry.profile) && matches(entry.profile, profileShape) && validRanks(entry.profile))) {
    throw new Error("La sesión guardada tiene un formato inválido o incompatible.");
  }
  if (value.result !== null) {
    const result = value.result;
    if (!object(result) || result.state !== "done" || !matches(result, {
      elapsedMs: 0,
      result: { mmrSpread: 0, offRoleCount: 0, warnings: [""], teams: [{
        id: 0, name: "", totalMmr: 0, averageMmr: 0, averageTrueMmr: 0,
        slots: [{ role: "", fit: "", offRole: false, effectiveMmr: 0, player: playerShape }],
      }] },
    }) || !object(result.result) || !Array.isArray(result.result.teams) ||
      !result.result.teams.every((team: Record<string, unknown>) =>
        Array.isArray(team.slots) && team.slots.length === 5 &&
        team.slots.every((slot: Record<string, unknown>) =>
          roles.includes(String(slot.role)) &&
          ["MAIN", "SECONDARY", "PLAYED", "OFF_ROLE", "FILL"].includes(String(slot.fit)) &&
          object(slot.player) && validRanks(slot.player)))) {
      throw new Error("Los equipos guardados tienen un formato inválido.");
    }
  }
}

export function parseSession(raw: string): BrowserSession {
  const value: unknown = JSON.parse(raw);
  assertSession(value);
  return value;
}
