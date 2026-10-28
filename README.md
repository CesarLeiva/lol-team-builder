# LoL Team Builder

Armador de equipos balanceados de League of Legends. Ingresas una lista de invocadores (`Nombre#TAG`), consulta la API oficial de Riot y genera equipos de 5 balanceados según el **True MMR** de cada jugador (rango Solo/Duo y Flex + sus últimas 50 partidas clasificatorias), asignando roles y repartiendo en forma de serpiente (snake draft).

## Características

- Busca invocadores con vista previa (ícono, nivel y rangos) y agrégalos a la lista, o pega una lista separada por comas.
- Las listas se validan completas: si un jugador no existe, no se agrega ninguno y se indica cuál falló.
- Respeta los límites de la API de Riot (cola con pausas automáticas) y muestra el progreso.
- Guarda la lista y los últimos equipos en el navegador (`localStorage`).

## Requisitos

- [Node.js](https://nodejs.org) 20.9 o superior (incluye `npm`).
- [Git](https://git-scm.com) para clonar el proyecto.
- Una **API key de Riot Games** (ver más abajo).

## Instalación

```bash
git clone https://github.com/CesarLeiva/lol-team-builder.git
cd lol-team-builder
npm install
```

## Configurar la API key de Riot

### 1. Obtener la key

1. Entra a <https://developer.riotgames.com> e inicia sesión con tu cuenta de Riot.
2. Acepta los términos si es tu primera vez.
3. En el panel (*Dashboard*) verás tu **Development API Key**, que empieza con `RGAPI-`. Si no aparece, presiona **Regenerate API Key**.
4. Cópiala.

> La Development Key **expira cada 24 horas**. Cuando deje de funcionar (errores `401` o `403`), vuelve al panel, regenera la key y actualiza el archivo `.env.local`. Una key recién generada puede tardar unos 30 segundos en activarse.

### 2. Crear el archivo `.env.local`

En la raíz del proyecto, crea un archivo llamado `.env.local` (puedes copiar el ejemplo):

```bash
# Windows (PowerShell)
Copy-Item .env.example .env.local

# macOS / Linux
cp .env.example .env.local
```

Ábrelo y pega tu key:

```env
RIOT_API_KEY=RGAPI-tu-key-aqui
```

- **No** uses el prefijo `NEXT_PUBLIC_`: la key debe quedarse en el servidor.
- **Nunca** subas `.env.local` a GitHub (ya está en `.gitignore`).
- Si cambias la key con el servidor encendido y no la toma, reinícialo.

## Uso

```bash
npm run dev
```

Abre <http://localhost:3000>, elige tu servidor (LAN, LAS, NA, EUW...), agrega al menos 10 jugadores (la cantidad debe ser múltiplo de 5) y presiona **Armar equipos**.

Para producción:

```bash
npm run build
npm start
```

### Tiempos

Cada jugador requiere cerca de 53 peticiones (cuenta, rango, lista de partidas y hasta 50 partidas). Con la key de desarrollo (100 peticiones cada 2 minutos) el primer cálculo de 15 jugadores puede tardar varios minutos. Las partidas se guardan en caché local (`.cache/`), así que recalcular los mismos jugadores es mucho más rápido.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `RIOT_API_KEY` | Sí | API key personal de Riot. |
| `RIOT_DISK_CACHE` | No | Pon `false` para desactivar la caché de partidas en disco. |

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Compilación de producción. |
| `npm start` | Servidor de producción. |
| `npm run lint` | Revisión con ESLint. |

## Aviso legal

Proyecto no oficial. No está avalado por Riot Games ni refleja las opiniones de Riot Games o de quienes participan en la producción o gestión de League of Legends. League of Legends y Riot Games son marcas registradas de Riot Games, Inc.
