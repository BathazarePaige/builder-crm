import { ArrowDown, ArrowUp, DollarSign, Users, ShoppingBag, PieChart, type LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import type { DatosTablero, Indicador } from "@/lib/tableau-de-bord/donnees";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import { COULEURS } from "./palette";

interface Def {
  cle: keyof DatosTablero["indicadores"];
  titre: string;
  icone: LucideIcon;
  couleur: string;
  format: (v: number) => string;
  /** La variacion de la conversion va en puntos, no en %. */
  points?: boolean;
}

const DEFS: Def[] = [
  { cle: "ingresos", titre: "Chiffre d’affaires", icone: DollarSign, couleur: COULEURS.bleu, format: formatCurrency },
  { cle: "contactos", titre: "Nouveaux contacts", icone: Users, couleur: COULEURS.vert, format: (v) => v.toLocaleString("fr-FR") },
  { cle: "valorMedio", titre: "Affaire moyenne", icone: ShoppingBag, couleur: COULEURS.violet, format: formatCurrency },
  {
    cle: "conversion",
    titre: "Taux de conversion",
    icone: PieChart,
    couleur: COULEURS.orange,
    format: (v) => `${v.toLocaleString("fr-FR")} %`,
    points: true,
  },
];

export function CartesIndicateurs({ indicadores, libellePeriode }: { indicadores: DatosTablero["indicadores"]; libellePeriode: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
      {DEFS.map((d) => (
        <CarteIndicateur key={d.cle} def={d} ind={indicadores[d.cle]} libellePeriode={libellePeriode} />
      ))}
    </div>
  );
}

function CarteIndicateur({ def, ind, libellePeriode }: { def: Def; ind: Indicador; libellePeriode: string }) {
  const Icone = def.icone;
  const v = ind.variacion;
  const hausse = v !== null && v >= 0;
  return (
    <div className="rounded-2xl border border-[#ECEEF3] bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] dark:border-border">
      <div className="flex items-start gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${def.couleur}, ${def.couleur}D9)` }}
        >
          <Icone className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">{def.titre}</p>
          <p className="mt-1 text-[24px] whitespace-nowrap font-semibold leading-tight tracking-tight tabular-nums">
            {ind.valor === null ? "—" : def.format(ind.valor)}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground">
            {v === null ? (
              <span>Pas de comparaison</span>
            ) : (
              <>
                <span className={cn("inline-flex items-center gap-0.5 font-semibold", hausse ? "text-[#16A34A]" : "text-[#E11D48]")}>
                  {hausse ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(v).toLocaleString("fr-FR")}
                  {def.points ? " pts" : " %"}
                </span>
                <span>{libellePeriode}</span>
              </>
            )}
          </p>
        </div>
      </div>
      <Sparkline serie={ind.serie} couleur={def.couleur} className="mt-4 h-12 w-full" />
    </div>
  );
}
