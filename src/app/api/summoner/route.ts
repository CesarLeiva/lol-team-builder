import type { NextRequest } from "next/server";
import type { PlatformId } from "@/types/riot";
import { PLATFORM_TO_MATCH_REGION, RiotApiError } from "@/lib/riot/riot-client";
import { formatRiotId, parseRiotId } from "@/lib/team-builder/parse-input";
import { getSummonerPreview } from "@/lib/team-builder/summoner-preview";

function isPlatform(value: unknown): value is PlatformId {
  return typeof value === "string" && value in PLATFORM_TO_MATCH_REGION;
}

/** GET /api/summoner?platform=la1&riotId=Nombre%23TAG */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const platform = searchParams.get("platform");
  const parsed = parseRiotId(searchParams.get("riotId") ?? "");

  if (!isPlatform(platform)) return Response.json({ message: "Servidor inválido" }, { status: 400 });
  if ("reason" in parsed) return Response.json({ message: parsed.reason }, { status: 400 });
  if (!process.env.RIOT_API_KEY) {
    return Response.json({ message: "Falta RIOT_API_KEY en .env.local" }, { status: 500 });
  }

  try {
    const preview = await getSummonerPreview(platform, parsed, request.signal);
    return Response.json(preview);
  } catch (error) {
    if (error instanceof RiotApiError) {
      if (error.status === 404) {
        const message = error.url.includes("/riot/account/")
          ? `No existe el invocador ${formatRiotId(parsed)}`
          : `${formatRiotId(parsed)} no tiene perfil en el servidor ${platform.toUpperCase()}`;
        return Response.json({ message }, { status: 404 });
      }
      return Response.json({ message: error.message }, { status: error.status === 429 ? 429 : 502 });
    }
    return Response.json({ message: error instanceof Error ? error.message : "Error inesperado" }, { status: 500 });
  }
}
