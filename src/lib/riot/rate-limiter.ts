import type { RateLimitWaitReason } from "@/types/team-builder";

export interface RateLimitWindow {
  maxRequests: number;
  windowMs: number;
}

export interface WaitInfo {
  waitMs: number;
  reason: RateLimitWaitReason;
  /** Ventana que provocó la espera (solo si reason === "window"). */
  window?: RateLimitWindow;
  queued: number;
}

export interface RateLimiterOptions {
  windows: RateLimitWindow[];
  /** Peticiones simultáneas en vuelo. */
  maxConcurrent?: number;
  /** Margen extra por desfase de reloj entre nuestro servidor y Riot. */
  safetyMarginMs?: number;
  now?: () => number;
}

interface QueuedTask {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/**
 * Cola FIFO con "sliding window log" para múltiples límites simultáneos.
 *
 * Con la ventana de 80 req / 120 s se comporta como un procesamiento por chunks:
 * despacha hasta 80 peticiones (respetando el límite por segundo), y cuando el
 * cupo se agota pausa exactamente hasta que la petición más antigua sale de la
 * ventana; luego continúa con el siguiente bloque.
 */
export class RateLimiter {
  private readonly windows: RateLimitWindow[];
  private readonly logs: number[][];
  private readonly maxConcurrent: number;
  private readonly safetyMarginMs: number;
  private readonly now: () => number;

  private queue: QueuedTask[] = [];
  private active = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private blockedUntil = 0;
  private readonly waitListeners = new Set<(info: WaitInfo) => void>();

  constructor(options: RateLimiterOptions) {
    if (options.windows.length === 0) throw new Error("RateLimiter requiere al menos una ventana");
    for (const w of options.windows) {
      if (w.maxRequests < 1 || w.windowMs <= 0) throw new Error("Ventana de rate limit inválida");
    }
    this.windows = options.windows;
    this.logs = options.windows.map(() => []);
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? 10);
    this.safetyMarginMs = options.safetyMarginMs ?? 100;
    this.now = options.now ?? Date.now;
  }

  get pending(): number {
    return this.queue.length;
  }

  get inFlight(): number {
    return this.active;
  }

  /** Encola una tarea. Cada tarea cuenta como 1 petición contra todas las ventanas. */
  schedule<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);

    return new Promise<T>((resolve, reject) => {
      const entry: QueuedTask = {
        run: task,
        resolve: resolve as (value: unknown) => void,
        reject,
        signal,
      };

      if (signal) {
        entry.onAbort = () => {
          const idx = this.queue.indexOf(entry);
          if (idx !== -1) {
            this.queue.splice(idx, 1);
            reject(signal.reason);
          }
        };
        signal.addEventListener("abort", entry.onAbort, { once: true });
      }

      this.queue.push(entry);
      this.drain();
    });
  }

  /** Bloquea toda la cola (usado cuando Riot responde 429 con Retry-After). */
  pauseFor(ms: number): void {
    const until = this.now() + ms;
    if (until <= this.blockedUntil) return;
    this.blockedUntil = until;
    this.emitWait({ waitMs: ms, reason: "retry-after", queued: this.queue.length });
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.drain();
  }

  /** Suscripción a eventos de espera. Devuelve la función para desuscribirse. */
  onWait(listener: (info: WaitInfo) => void): () => void {
    this.waitListeners.add(listener);
    return () => this.waitListeners.delete(listener);
  }

  /** Tiempo hasta que se pueda despachar la siguiente petición (0 = ya). */
  private computeWait(now: number): Omit<WaitInfo, "queued"> {
    if (this.blockedUntil > now) {
      return { waitMs: this.blockedUntil - now, reason: "retry-after" };
    }

    let result: Omit<WaitInfo, "queued"> = { waitMs: 0, reason: "window" };
    this.windows.forEach((window, i) => {
      const log = this.logs[i];
      const cutoff = now - window.windowMs;
      while (log.length > 0 && log[0] <= cutoff) log.shift();

      if (log.length >= window.maxRequests) {
        const oldestBlocking = log[log.length - window.maxRequests];
        const waitMs = oldestBlocking + window.windowMs - now + this.safetyMarginMs;
        if (waitMs > result.waitMs) result = { waitMs, reason: "window", window };
      }
    });
    return result;
  }

  private drain(): void {
    if (this.timer) return;

    while (this.queue.length > 0 && this.active < this.maxConcurrent) {
      const now = this.now();
      const wait = this.computeWait(now);

      if (wait.waitMs > 0) {
        // Solo notificamos esperas por ventana; las de retry-after ya se notificaron en pauseFor.
        if (wait.reason === "window") this.emitWait({ ...wait, queued: this.queue.length });
        this.timer = setTimeout(() => {
          this.timer = null;
          this.drain();
        }, wait.waitMs);
        return;
      }

      const entry = this.queue.shift()!;
      if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);

      for (const log of this.logs) log.push(now);
      this.active++;

      Promise.resolve()
        .then(entry.run)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }

  private emitWait(info: WaitInfo): void {
    for (const listener of this.waitListeners) {
      try {
        listener(info);
      } catch {
        // Un listener defectuoso no debe romper la cola.
      }
    }
  }
}

/**
 * Límites de una Personal/Development Key: 20 req / 1 s y 100 req / 2 min.
 * Usamos márgenes de seguridad (18 y 80) para no rozar el límite real.
 */
export const RIOT_PERSONAL_KEY_LIMITS: RateLimitWindow[] = [
  { maxRequests: 18, windowMs: 1_000 },
  { maxRequests: 80, windowMs: 120_000 },
];

/**
 * Singleton por proceso: el límite es por API key, así que todas las peticiones
 * del servidor deben compartir la misma cola. Se guarda en globalThis para
 * sobrevivir al hot-reload de `next dev`.
 *
 * Nota: en serverless (varias instancias) cada instancia tendría su propia cola;
 * para este caso de uso conviene desplegar en un servidor Node único.
 */
const globalForLimiter = globalThis as typeof globalThis & { __riotRateLimiter?: RateLimiter };

export const riotRateLimiter: RateLimiter = (globalForLimiter.__riotRateLimiter ??= new RateLimiter({
  windows: RIOT_PERSONAL_KEY_LIMITS,
  maxConcurrent: 10,
}));
