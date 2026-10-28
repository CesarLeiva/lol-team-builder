"use client";

import { useCallback, useRef, useState } from "react";
import type { PlatformId } from "@/types/riot";
import type { InvalidEntry, RiotId, SummonerPreview } from "@/types/team-builder";
import { TEAM_BUILDER_CONFIG } from "@/lib/team-builder/config";
import { formatRiotId, parseRiotId, riotIdKey } from "@/lib/team-builder/parse-input";

export async function fetchSummonerPreview(
  riotId: RiotId,
  platform: PlatformId,
  signal?: AbortSignal,
): Promise<SummonerPreview> {
  const params = new URLSearchParams({ platform, riotId: formatRiotId(riotId) });
  const res = await fetch(`/api/summoner?${params}`, { signal });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? `Error HTTP ${res.status}`);
  return data as SummonerPreview;
}

export type RosterEntry = { key: string; riotId: RiotId } & (
  | { status: "loading" }
  | { status: "ready"; profile: SummonerPreview }
  | { status: "error"; message: string }
);

export interface AddManyResult {
  added: number;
  duplicates: string[];
  invalid: InvalidEntry[];
  overflow: number;
}

/** Divide un texto con comas / saltos de línea en entradas no vacías. */
export function splitList(text: string): string[] {
  return text
    .split(/[,\n\r;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useRoster(platform: PlatformId, initialEntries: RosterEntry[] = []) {
  const [entries, setEntries] = useState<RosterEntry[]>(initialEntries);
  const [isImporting, setIsImporting] = useState(false);
  const importingRef = useRef(false);

  const resolve = useCallback(
    async (key: string, riotId: RiotId) => {
      try {
        const profile = await fetchSummonerPreview(riotId, platform);
        setEntries((list) => {
          const dupe = list.some((e) => e.key !== key && e.status === "ready" && e.profile.puuid === profile.puuid);
          return list.map((e) =>
            e.key !== key
              ? e
              : dupe
                ? { key, riotId, status: "error", message: "Es la misma cuenta que otro jugador de la lista" }
                : { key, riotId: profile.riotId, status: "ready", profile },
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al buscar";
        setEntries((list) => list.map((e) => (e.key === key ? { key, riotId, status: "error", message } : e)));
      }
    },
    [platform],
  );

  const has = useCallback((riotId: RiotId) => entries.some((e) => e.key === riotIdKey(riotId)), [entries]);

  /** Agrega un perfil ya consultado (desde la vista previa). */
  const addProfile = useCallback(
    (profile: SummonerPreview): string | null => {
      if (importingRef.current) return "Espera a que termine la validación de la lista";
      if (entries.length >= TEAM_BUILDER_CONFIG.maxPlayers) return `Máximo ${TEAM_BUILDER_CONFIG.maxPlayers} jugadores`;
      const key = riotIdKey(profile.riotId);
      if (entries.some((e) => e.key === key || (e.status === "ready" && e.profile.puuid === profile.puuid))) {
        return `${formatRiotId(profile.riotId)} ya está en la lista`;
      }
      setEntries((list) => [...list, { key, riotId: profile.riotId, status: "ready", profile }]);
      return null;
    },
    [entries],
  );

  /** Valida el lote completo antes de modificar la lista. */
  const addMany = useCallback(
    async (raws: string[]): Promise<AddManyResult> => {
      const result: AddManyResult = { added: 0, duplicates: [], invalid: [], overflow: 0 };
      if (importingRef.current) {
        result.invalid.push({ raw: raws.join(", "), reason: "Ya se está validando otra lista" });
        return result;
      }
      const keys = new Set(entries.map((e) => e.key));
      const toValidate: RiotId[] = [];

      for (const raw of raws) {
        const parsed = parseRiotId(raw);
        if ("reason" in parsed) {
          result.invalid.push({ raw, reason: parsed.reason });
          continue;
        }
        const key = riotIdKey(parsed);
        if (keys.has(key)) {
          result.duplicates.push(formatRiotId(parsed));
          continue;
        }
        if (entries.length + toValidate.length >= TEAM_BUILDER_CONFIG.maxPlayers) {
          result.overflow++;
          continue;
        }
        keys.add(key);
        toValidate.push(parsed);
      }

      if (result.invalid.length > 0 || result.overflow > 0 || toValidate.length === 0) return result;

      importingRef.current = true;
      setIsImporting(true);
      try {
        const profiles = await Promise.allSettled(
          toValidate.map((riotId) => fetchSummonerPreview(riotId, platform)),
        );
        const toAdd: RosterEntry[] = [];
        const puuids = new Set(entries.flatMap((e) => e.status === "ready" ? [e.profile.puuid] : []));
        profiles.forEach((outcome, i) => {
          if (outcome.status === "rejected") {
            result.invalid.push({
              raw: formatRiotId(toValidate[i]),
              reason: outcome.reason instanceof Error ? outcome.reason.message : "Error al buscar el perfil",
            });
            return;
          }
          const profile = outcome.value;
          if (puuids.has(profile.puuid)) {
            result.duplicates.push(formatRiotId(profile.riotId));
            return;
          }
          puuids.add(profile.puuid);
          toAdd.push({ key: riotIdKey(profile.riotId), riotId: profile.riotId, status: "ready", profile });
        });
        if (result.invalid.length > 0) return result;
        setEntries((list) => [...list, ...toAdd]);
        result.added = toAdd.length;
        return result;
      } finally {
        importingRef.current = false;
        setIsImporting(false);
      }
    },
    [entries, platform],
  );

  const retry = useCallback(
    (key: string) => {
      if (importingRef.current) return;
      const entry = entries.find((e) => e.key === key);
      if (!entry) return;
      setEntries((list) => list.map((e) => (e.key === key ? { key, riotId: e.riotId, status: "loading" } : e)));
      void resolve(key, entry.riotId);
    },
    [entries, resolve],
  );

  const remove = useCallback((key: string) => {
    if (!importingRef.current) setEntries((list) => list.filter((e) => e.key !== key));
  }, []);
  const clear = useCallback(() => {
    if (!importingRef.current) setEntries([]);
  }, []);

  return { entries, isImporting, has, addProfile, addMany, retry, remove, clear };
}
