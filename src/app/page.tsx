import { TeamBuilder } from "@/components/team-builder";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center px-4 py-12 sm:px-8">
      <header className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">League of Legends</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">Team Builder</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-400">
          Arma equipos balanceados según el True MMR de cada jugador, calculado con su rango y sus últimas 50
          partidas clasificatorias.
        </p>
      </header>
      <TeamBuilder />
    </main>
  );
}
