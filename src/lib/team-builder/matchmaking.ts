import {
  ROLES,
  TEAM_SIZE,
  type PlayerProfile,
  type Role,
  type RoleFit,
  type Team,
  type TeamBuildResult,
  type TeamSlot,
} from "@/types/team-builder";
import { hungarian } from "./hungarian";

/** MMR que se descuenta al jugador según qué tan cómodo está en el rol asignado. */
export const ROLE_FIT_PENALTY: Record<RoleFit, number> = {
  MAIN: 0,
  SECONDARY: 40,
  FILL: 50,
  PLAYED: 80,
  OFF_ROLE: 150,
};

const SECONDARY_MIN_SHARE = 0.15;

export function getRoleFit(player: PlayerProfile, role: Role): RoleFit {
  const total = ROLES.reduce((sum, r) => sum + player.roleCounts[r], 0);
  if (total === 0) return "FILL";
  if (role === player.mainRole) return "MAIN";
  const count = player.roleCounts[role];
  if (role === player.secondaryRole && count / total >= SECONDARY_MIN_SHARE) return "SECONDARY";
  return count > 0 ? "PLAYED" : "OFF_ROLE";
}

function toSlot(player: PlayerProfile, role: Role): TeamSlot {
  const fit = getRoleFit(player, role);
  return {
    role,
    player,
    fit,
    offRole: fit !== "MAIN" && fit !== "FILL",
    effectiveMmr: player.trueMmr - ROLE_FIT_PENALTY[fit],
  };
}

// ---------------------------------------------------------------------------
// Paso 1: asignación de roles
// ---------------------------------------------------------------------------

/**
 * Agrupa a los jugadores por rol de forma que cada rol tenga exactamente N
 * jugadores (N = número de equipos).
 *
 * Es el "agrupar por rol preferido + rellenar huecos con los sobrantes" del
 * enunciado, pero resuelto de forma óptima: el algoritmo húngaro elige a
 * quién mover de rol minimizando la pérdida total de MMR por fuera de rol
 * (prioriza mover a quien tiene un secundario sólido antes que a un one-trick).
 */
export function assignRoles(players: PlayerProfile[]): Map<Role, TeamSlot[]> {
  const teamCount = players.length / TEAM_SIZE;
  if (!Number.isInteger(teamCount) || teamCount < 1) {
    throw new Error(`Se necesita un múltiplo de ${TEAM_SIZE} jugadores (hay ${players.length})`);
  }

  // Columna j = cupo del rol ROLES[floor(j / teamCount)].
  const slotRoles = ROLES.flatMap((role) => Array<Role>(teamCount).fill(role));

  // Desempate mínimo: a igual costo, se prefiere que el de mayor MMR juegue su main.
  const maxMmr = Math.max(1, ...players.map((p) => p.trueMmr));
  const cost = players.map((player) =>
    slotRoles.map((role) => {
      const fit = getRoleFit(player, role);
      const penalty = ROLE_FIT_PENALTY[fit];
      return penalty > 0 ? penalty + (player.trueMmr / maxMmr) * 0.01 : 0;
    }),
  );

  const assignment = hungarian(cost);
  const byRole = new Map<Role, TeamSlot[]>(ROLES.map((r) => [r, []]));
  assignment.forEach((col, row) => {
    const role = slotRoles[col];
    byRole.get(role)!.push(toSlot(players[row], role));
  });

  // Cada grupo de rol ordenado de mayor a menor MMR efectivo.
  for (const group of byRole.values()) group.sort((a, b) => b.effectiveMmr - a.effectiveMmr);
  return byRole;
}

// ---------------------------------------------------------------------------
// Paso 2: snake draft por rol
// ---------------------------------------------------------------------------

type TeamDraft = Map<Role, TeamSlot>;

function teamTotal(team: TeamDraft): number {
  let total = 0;
  for (const slot of team.values()) total += slot.effectiveMmr;
  return total;
}

/**
 * Cada rol es una "ronda" del draft. Dentro de la ronda los jugadores (de mayor
 * a menor) se reparten 1→N y la siguiente ronda N→1. Los roles con mayor
 * diferencia de nivel van primero, que es donde más importa la serpiente.
 */
export function snakeDraft(byRole: Map<Role, TeamSlot[]>, teamCount: number): TeamDraft[] {
  const teams: TeamDraft[] = Array.from({ length: teamCount }, () => new Map());
  const spread = (g: TeamSlot[]) => (g.length ? g[0].effectiveMmr - g[g.length - 1].effectiveMmr : 0);
  const rounds = [...byRole.entries()].sort(([, a], [, b]) => spread(b) - spread(a));

  rounds.forEach(([role, group], round) => {
    group.forEach((slot, i) => {
      const teamIndex = round % 2 === 0 ? i : teamCount - 1 - i;
      teams[teamIndex].set(role, slot);
    });
  });
  return teams;
}

// ---------------------------------------------------------------------------
// Paso 3: refinamiento (menor impacto en el balance)
// ---------------------------------------------------------------------------

/** Combinaciones de 1 y 2 roles para intercambiar entre dos equipos. */
const SWAP_SETS: Role[][] = [
  ...ROLES.map((r) => [r]),
  ...ROLES.flatMap((r, i) => ROLES.slice(i + 1).map((s) => [r, s])),
];

/**
 * El snake draft deja pequeñas diferencias (con 5 rondas, el equipo 1 elige
 * primero 3 veces). Se intercambian jugadores del MISMO rol (uno o dos roles a
 * la vez, para salir de óptimos locales) entre pares de equipos mientras se
 * reduzca la varianza de los totales. Nadie cambia de rol.
 */
export function refineBySwaps(teams: TeamDraft[], maxIterations = 1_000): TeamDraft[] {
  if (teams.length < 2) return teams;
  const totals = teams.map(teamTotal);
  const mean = totals.reduce((a, b) => a + b, 0) / teams.length;
  const sq = (x: number) => (x - mean) ** 2;

  for (let iter = 0; iter < maxIterations; iter++) {
    let best: { a: number; b: number; roles: Role[]; delta: number; gain: number } | null = null;

    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        for (const roles of SWAP_SETS) {
          let delta = 0;
          for (const role of roles) delta += teams[a].get(role)!.effectiveMmr - teams[b].get(role)!.effectiveMmr;
          if (delta === 0) continue;
          const gain = sq(totals[a]) + sq(totals[b]) - (sq(totals[a] - delta) + sq(totals[b] + delta));
          // A igual ganancia se prefiere mover menos jugadores.
          if (gain > 1e-9 && (!best || gain > best.gain + 1e-9)) best = { a, b, roles, delta, gain };
        }
      }
    }

    if (!best) break;
    const { a, b, roles, delta } = best;
    for (const role of roles) {
      const slotA = teams[a].get(role)!;
      teams[a].set(role, teams[b].get(role)!);
      teams[b].set(role, slotA);
    }
    totals[a] -= delta;
    totals[b] += delta;
  }
  return teams;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function variance(teams: TeamDraft[]): number {
  const totals = teams.map(teamTotal);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  return totals.reduce((sum, t) => sum + (t - mean) ** 2, 0);
}

/** PRNG determinista (mulberry32): mismos jugadores => mismos equipos. */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Reparte cada grupo de rol en orden aleatorio (sigue siendo 1 jugador por rol por equipo). */
function randomDraft(byRole: Map<Role, TeamSlot[]>, teamCount: number, random: () => number): TeamDraft[] {
  const teams: TeamDraft[] = Array.from({ length: teamCount }, () => new Map());
  for (const [role, group] of byRole) {
    const shuffled = [...group];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((slot, t) => teams[t].set(role, slot));
  }
  return teams;
}

/**
 * Parte del snake draft y lo refina. Con 3+ equipos el refinamiento local
 * puede estancarse, así que se prueban además varios repartos iniciales
 * aleatorios (deterministas) y se conserva el más parejo.
 */
export function buildBalancedTeams(players: PlayerProfile[], restarts = 40): TeamBuildResult {
  const teamCount = players.length / TEAM_SIZE;
  const sorted = [...players].sort((a, b) => b.trueMmr - a.trueMmr || a.puuid.localeCompare(b.puuid));

  const byRole = assignRoles(sorted);
  let drafts = refineBySwaps(snakeDraft(byRole, teamCount));
  let bestVariance = variance(drafts);

  if (teamCount > 2) {
    const random = seededRandom(sorted.reduce((h, p) => (h * 31 + p.trueMmr) | 0, 17));
    for (let i = 0; i < restarts && bestVariance > 0; i++) {
      const candidate = refineBySwaps(randomDraft(byRole, teamCount, random));
      const v = variance(candidate);
      if (v < bestVariance - 1e-9) {
        drafts = candidate;
        bestVariance = v;
      }
    }
  }

  const teams: Team[] = drafts.map((draft, i) => {
    const slots = ROLES.map((role) => draft.get(role)!);
    const totalMmr = slots.reduce((sum, s) => sum + s.effectiveMmr, 0);
    const totalTrue = slots.reduce((sum, s) => sum + s.player.trueMmr, 0);
    return {
      id: i + 1,
      name: `Equipo ${i + 1}`,
      slots,
      totalMmr,
      averageMmr: Math.round(totalMmr / TEAM_SIZE),
      averageTrueMmr: Math.round(totalTrue / TEAM_SIZE),
    };
  });

  const averages = teams.map((t) => t.averageMmr);
  return {
    teams,
    mmrSpread: Math.max(...averages) - Math.min(...averages),
    offRoleCount: teams.reduce((n, t) => n + t.slots.filter((s) => s.offRole).length, 0),
    warnings: [],
  };
}
