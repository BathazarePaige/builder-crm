"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { SOURCE_LABELS } from "@/lib/constants";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import type { LeadSource } from "@/types";
import { Carte, Vide } from "./Carte";
import { SERIE_COULEURS } from "./palette";

/** Donut de contactos nuevos por origen: las 4 primeras fuentes y el resto en "Autres". */
export function SourcesContacts({ fuentes }: { fuentes: DatosTablero["fuentes"] }) {
  const total = fuentes.reduce((s, f) => s + f.cantidad, 0);
  const top = fuentes.slice(0, 4).map((f) => ({ nom: SOURCE_LABELS[f.fuente as LeadSource] ?? f.fuente, cantidad: f.cantidad }));
  const reste = fuentes.slice(4).reduce((s, f) => s + f.cantidad, 0);
  const parts = reste > 0 ? [...top, { nom: "Autres", cantidad: reste }] : top;

  return (
    <Carte titre="Sources des contacts" sousTitre="Nouveaux contacts par origine.">
      {total === 0 ? (
        <Vide>Aucun nouveau contact sur la période.</Vide>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative h-[140px] w-[140px] shrink-0">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 140, height: 140 }}>
              <PieChart>
                <Pie data={parts} dataKey="cantidad" nameKey="nom" innerRadius={46} outerRadius={68} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                  {parts.map((_, i) => (
                    <Cell key={i} fill={SERIE_COULEURS[i % SERIE_COULEURS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[19px] font-semibold tabular-nums leading-none">{total.toLocaleString("fr-FR")}</span>
              <span className="mt-1 text-[11px] text-muted-foreground">Total</span>
            </div>
          </div>
          <ul className="flex-1 min-w-0 space-y-2.5">
            {parts.map((p, i) => (
              <li key={p.nom} className="flex items-center gap-2 text-[12.5px]">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIE_COULEURS[i % SERIE_COULEURS.length] }} />
                <span className="flex-1 truncate font-medium">{p.nom}</span>
                <span className="tabular-nums text-muted-foreground">
                  {((p.cantidad / total) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Carte>
  );
}
