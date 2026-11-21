import { ArrowDown, ArrowUp } from "lucide-react";
import { avatarBg, getInitials } from "@/lib/avatar";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { cn } from "@/lib/utils";
import { Carte, Vide } from "./Carte";

/** Por persona: operaciones de sus contactos, ganadas sobre el total, y tasa de cierre. */
export function PerformanceEquipe({ equipe }: { equipe: DatosTablero["equipo"] }) {
  return (
    <Carte titre="Performance de l’équipe" lien={{ href: "/settings", label: "Voir l’équipe" }}>
      {equipe.length === 0 ? (
        <Vide>Aucun membre actif.</Vide>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="px-1 pb-2 font-medium">Membre</th>
                <th className="px-1 pb-2 font-medium">Rôle</th>
                <th className="px-1 pb-2 text-right font-medium">Gagnées</th>
                <th className="px-1 pb-2 text-right font-medium">Performance</th>
              </tr>
            </thead>
            <tbody>
              {equipe.map((m) => {
                const r = m.rendimiento;
                return (
                  <tr key={m.id} className="border-t border-border/60">
                    <td className="px-1 py-2.5">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", avatarBg(m.nombre))}>
                          {getInitials(m.nombre)}
                        </span>
                        <span className="truncate font-medium">{m.nombre}</span>
                      </span>
                    </td>
                    <td className="px-1 py-2.5 text-muted-foreground">{m.rol}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">
                      {m.ganadas}/{m.total}
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums">
                      {r === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          {r} %
                          {r >= 50 ? <ArrowUp className="h-3 w-3 text-[#16A34A]" /> : <ArrowDown className="h-3 w-3 text-[#E11D48]" />}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Carte>
  );
}
