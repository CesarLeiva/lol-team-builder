import type { PlatformId } from "@/types/riot";
import type { BuildTeamsEvent, BuildTeamsRequest } from "@/types/team-builder";
import { PLATFORM_TO_MATCH_REGION } from "@/lib/riot/riot-client";
import { buildTeams, TeamBuilderError } from "@/lib/team-builder/build-teams";

/** Con 50 partidas por jugador el proceso puede durar decenas de minutos. */
export const maxDuration = 3600;

const HEARTBEAT_MS = 15_000;

function isPlatform(value: unknown): value is PlatformId {
  return typeof value === "string" && value in PLATFORM_TO_MATCH_REGION;
}

/**
 * Devuelve un stream NDJSON (un BuildTeamsEvent por línea) para que la UI
 * muestre el progreso en tiempo real. Si el cliente cierra la conexión,
 * `request.signal` cancela las peticiones pendientes en la cola.
 */
export async function POST(request: Request) {
  let body: Partial<BuildTeamsRequest>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Cuerpo JSON inválido" }, { status: 400 });
  }
  if (typeof body.input !== "string" || !body.input.trim()) {
    return Response.json({ message: "Ingresa al menos un invocador" }, { status: 400 });
  }
  if (!isPlatform(body.platform)) {
    return Response.json({ message: "Servidor inválido" }, { status: 400 });
  }
  if (!process.env.RIOT_API_KEY) {
    return Response.json(
      { message: "Falta RIOT_API_KEY en .env.local. Agrega tu Personal API Key y reinicia el servidor." },
      { status: 500 },
    );
  }

  const { input, platform } = body;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: BuildTeamsEvent | { type: "heartbeat" }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };
      // Evita que proxies/navegador corten la conexión durante las pausas largas del rate limit.
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), HEARTBEAT_MS);

      try {
        await buildTeams(input, { platform, signal: request.signal, onEvent: send });
      } catch (error) {
        if (!request.signal.aborted) {
          send({
            type: "error",
            message: error instanceof Error ? error.message : "Error inesperado",
            errors: error instanceof TeamBuilderError ? error.errors : undefined,
          });
        }
      } finally {
        clearInterval(heartbeat);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
