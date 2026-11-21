import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus } from "lucide-react";
import { getCurrentMember } from "@/lib/team";
import { getConfig } from "@/lib/config";
import { datosTablero } from "@/lib/tableau-de-bord/donnees";
import { leerPeriodo } from "@/lib/tableau-de-bord/calculs";
import { NotificationBanner } from "@/components/dashboard/NotificationBanner";
import { CargarDemo } from "@/components/dashboard/CargarDemo";
import { CartesIndicateurs } from "@/components/dashboard/CartesIndicateurs";
import { ApercuRevenus } from "@/components/dashboard/ApercuRevenus";
import { Entonnoir } from "@/components/dashboard/Entonnoir";
import { SourcesContacts } from "@/components/dashboard/SourcesContacts";
import { AnalysesIA } from "@/components/dashboard/AnalysesIA";
import { MeilleuresAffaires } from "@/components/dashboard/MeilleuresAffaires";
import { PerformanceEquipe } from "@/components/dashboard/PerformanceEquipe";
import { AffairesParEtape } from "@/components/dashboard/AffairesParEtape";
import { EvenementsAVenir } from "@/components/dashboard/EvenementsAVenir";
import { TachesDuJour } from "@/components/dashboard/TachesDuJour";
import { ActiviteRecente } from "@/components/dashboard/ActiviteRecente";
import { NoteRapide } from "@/components/dashboard/NoteRapide";

export const dynamic = "force-dynamic";

const LIBELLES = { 7: "vs 7 j préc.", 30: "vs 30 j préc.", 90: "vs 90 j préc." } as const;

function salutation(ahora: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: getConfig().zonaHoraria, hour: "numeric", hour12: false }).format(ahora)) % 24;
  return h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");

  const periode = leerPeriodo((await searchParams).periode);
  const ahora = new Date();
  const d = await datosTablero(member, periode, ahora);
  const anneeEnCours = Number(new Intl.DateTimeFormat("en-US", { timeZone: getConfig().zonaHoraria, year: "numeric" }).format(ahora));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight leading-tight">
            {salutation(ahora)}, {d.nombre} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">Voici où en est votre activité aujourd’hui.</p>
        </div>
        <div className="flex gap-2.5">
          <a
            href="/api/export?type=deals"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[13px] font-medium shadow-sm hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Exporter
          </a>
          <Link
            href="/contacts"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nouveau contact
          </Link>
        </div>
      </div>

      {!d.hayDatos && (
        <div className="rounded-2xl border border-primary-ink/15 bg-primary/5 p-5">
          <h2 className="text-[15px] font-semibold">Tout est prêt</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Pas encore de contact. Connectez un canal dans Réglages, ajoutez des contacts, ou chargez la démo pour voir le tableau de bord rempli.
          </p>
          {member.role === "admin" && (
            <div className="mt-3">
              <CargarDemo />
            </div>
          )}
        </div>
      )}

      <NotificationBanner />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <CartesIndicateurs indicadores={d.indicadores} libellePeriode={LIBELLES[periode]} />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
            <ApercuRevenus annee={d.ingresosAnio} douze={d.ingresos12m} anneeEnCours={anneeEnCours} />
            <Entonnoir niveaux={d.embudo} />
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
            <SourcesContacts fuentes={d.fuentes} />
            <AnalysesIA donnees={d} />
            <div className="md:col-span-2 2xl:col-span-1">
              <MeilleuresAffaires operations={d.mejoresOperaciones} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <PerformanceEquipe equipe={d.equipo} />
            <AffairesParEtape colonnes={d.porEtapa} />
          </div>
        </div>

        <aside className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <EvenementsAVenir evenements={d.eventos} />
          <TachesDuJour taches={d.tareas} />
          <ActiviteRecente elements={d.recientes} />
          <NoteRapide />
        </aside>
      </div>
    </div>
  );
}
