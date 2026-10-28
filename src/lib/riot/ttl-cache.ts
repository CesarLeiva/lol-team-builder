/**
 * Caché en memoria con expiración y deduplicación de peticiones simultáneas.
 * Los errores no se guardan (se reintenta en la siguiente llamada).
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 2_000,
  ) {}

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.entries.delete(key);
      this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
      if (this.entries.size > this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest !== undefined) this.entries.delete(oldest);
      }
      return value;
    } finally {
      this.inflight.delete(key);
    }
  }
}

/** Mantiene la misma instancia entre recargas de `next dev`. */
export function sharedCache<T>(name: string, ttlMs: number): TtlCache<T> {
  const store = globalThis as typeof globalThis & { __ttlCaches?: Map<string, unknown> };
  store.__ttlCaches ??= new Map();
  if (!store.__ttlCaches.has(name)) store.__ttlCaches.set(name, new TtlCache<T>(ttlMs));
  return store.__ttlCaches.get(name) as TtlCache<T>;
}
