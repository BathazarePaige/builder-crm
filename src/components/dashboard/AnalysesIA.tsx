import Link from "next/link";
import { ArrowRight, Bot, Sparkles, TrendingUp, Radio, type LucideIcon } from "lucide-react";
import { SOURCE_LABELS } from "@/lib/constants";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import type { LeadSource } from "@/types";
import { COULEURS } from "./palette";

interface Analyse {
  icone: LucideIcon;
  couleur: string;
  texte: React.ReactNode;
}

/**
 * Lecturas calculadas sobre los datos del tablero (no un modelo): tendencia de la
 * prevision, mejor origen de contactos y trabajo del agente en el periodo.
 */
function analyses(d: DatosTablero): Analyse[] {
  const out: Analyse[] = [];
  const reels = d.ingresosAnio.filter((p) => p.real !== null);
  const actuel = reels.at(-1)?.real ?? 0;
  const suivant = d.ingresosAnio.find((p) => p.real === null)?.prevision ?? null;
  if (suivant !== null && actuel > 0) {
    const pct = Math.round(((suivant - actuel) / actuel) * 100);
    out.push({
      icone: TrendingUp,
      couleur: COULEURS.violet,
      texte: (
        <>
          Le chiffre d’affaires devrait {pct >= 0 ? "progresser" : "reculer"} de{" "}
          <strong className="font-semibold text-primary-ink">{Math.abs(pct)} %</strong> le mois prochain.
        </>
      ),
    });
  } else {
    out.push({ icone: TrendingUp, couleur: COULEURS.violet, texte: "Pas encore assez d’affaires gagnées pour une prévision." });
  }

  const meilleure = d.fuentes[0];
  out.push({
    icone: Radio,
    couleur: COULEURS.vert,
    texte: meilleure ? (
      <>
        Votre meilleure source de contacts est <strong className="font-semibold">{SOURCE_LABELS[meilleure.fuente as LeadSource] ?? meilleure.fuente}</strong>.
      </>
    ) : (
      "Aucun nouveau contact sur la période."
    ),
  });

  const { respuestas, total, derivaciones } = d.agente;
  out.push({
    icone: Bot,
    couleur: COULEURS.orange,
    texte:
      total > 0 ? (
        <>
          L’agent IA a écrit <strong className="font-semibold text-primary-ink">{Math.round((respuestas / total) * 100)} %</strong> des réponses.{" "}
          {derivaciones > 0 && `${derivaciones} contact${derivaciones > 1 ? "s attendent" : " attend"} une personne.`}
        </>
      ) : (
        "L’agent IA n’a encore envoyé aucune réponse sur la période."
      ),
  });
  return out;
}

export function AnalysesIA({ donnees }: { donnees: DatosTablero }) {
  return (
    <section className="rounded-2xl border border-[#E7E4FB] bg-gradient-to-br from-[#F6F4FF] via-card to-[#F1F5FF] p-5 min-w-0 dark:border-border dark:from-card dark:to-card">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          Analyses IA
          <span className="rounded-md bg-[#EAE6FE] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#6D4FE6]">Bêta</span>
        </h2>
        <Sparkles className="h-5 w-5 text-[#7C5CF5]" />
      </header>
      <ul className="space-y-4">
        {analyses(donnees).map((a, i) => (
          <li key={i} className="flex gap-3 text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${a.couleur}1A`, color: a.couleur }}>
              <a.icone className="h-3.5 w-3.5" />
            </span>
            <p>{a.texte}</p>
          </li>
        ))}
      </ul>
      <Link
        href="/reportes"
        className="mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-[12.5px] font-medium text-primary-ink shadow-sm hover:bg-muted"
      >
        Voir les rapports <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}
