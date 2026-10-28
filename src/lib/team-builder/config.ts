/** Parámetros ajustables del análisis. */
export const TEAM_BUILDER_CONFIG = {
  /** Partidas clasificatorias (Solo/Duo + Flex) a analizar por jugador, sin importar su antigüedad. */
  matchesToAnalyze: 50,
  minPlayers: 10,
  /** Protege la cuota de la API: 50 jugadores ≈ 2650 peticiones ≈ 66 min sin caché. */
  maxPlayers: 50,
  /** Partidas más cortas se consideran remakes. */
  minGameDurationSec: 300,
} as const;

export const MMR_CONFIG = {
  /** Jugador sin rango ni datos de lobby (~Bronce II). */
  defaultMmr: 1300,
  /** Flex suele estar inflado respecto a Solo/Duo. */
  flexOffset: 100,
  /** Con menos partidas Solo/Duo que esto, el rango Solo se mezcla con el Flex. */
  minSoloGamesForFullTrust: 20,
  /** Peso de recencia: una partida pesa la mitad cada `recencyHalfLife` partidas hacia atrás. */
  recencyHalfLife: 20,

  /** Rendimiento promedio (-1..1) * peso. */
  performanceWeight: 250,
  /** (winrate - 0.5) * peso. */
  winrateWeight: 400,
  /** (rendimiento/winrate recientes - antiguos) * peso. */
  trendWeight: 150,
  maxTrendAdjustment: 60,
  /** Tope de la suma de ajustes por rendimiento. */
  maxAdjustment: 200,

  /** Muestras mínimas de lobby para estimar el MMR de un jugador sin rango. */
  lobbyMinSamples: 5,
  /** Peso máximo del lobby al "verificar" un jugador que sí tiene rango. */
  lobbyMaxWeightWhenRanked: 0.3,
  lobbySamplesForMaxWeight: 30,
} as const;
