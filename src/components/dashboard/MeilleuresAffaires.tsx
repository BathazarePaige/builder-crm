import Link from "next/link";
import { Briefcase } from "lucide-react";
import { formatCurrency } from "@/lib/constants";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { Carte, Vide } from "./Carte";
import { SERIE_COULEURS } from "./palette";

/** Las cinco operaciones abiertas de mayor valor, con una barra relativa a la primera. */
export function MeilleuresAffaires({ operations }: { operations: DatosTablero["mejoresOperaciones"] }) {
  const max = operations[0]?.valor || 1;
  return (
    <Carte titre="Meilleures affaires" sousTitre="Affaires en cours de plus grande valeur." lien={{ href: "/pipeline", label: "Voir tout" }}>
      {operations.length === 0 ? (
        <Vide>Aucune affaire en cours.</Vide>
      ) : (
        <ul className="space-y-3.5">
          {operations.map((o, i) => {
            const c = SERIE_COULEURS[i % SERIE_COULEURS.length];
            return (
              <li key={o.id}>
                <Link href="/pipeline" className="flex items-center gap-3 text-[12.5px] group">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${c}1A`, color: c }}>
                    <Briefcase className="h-3.5 w-3.5" />
                  </span>
                  <span className="w-[34%] min-w-0 truncate font-medium group-hover:underline" title={o.contacto ?? undefined}>
                    {o.titulo}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full" style={{ width: `${Math.max(6, (o.valor / max) * 100)}%`, background: c }} />
                  </span>
                  <span className="w-[76px] shrink-0 text-right font-semibold tabular-nums">{formatCurrency(o.valor)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Carte>
  );
}
