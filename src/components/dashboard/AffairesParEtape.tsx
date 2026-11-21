import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { avatarBg, getInitials } from "@/lib/avatar";
import { getConfig } from "@/lib/config";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { cn } from "@/lib/utils";
import { Carte, Vide } from "./Carte";

function badge(p: number) {
  if (p >= 70) return "bg-[#E8F7EF] text-[#15803D]";
  if (p >= 40) return "bg-[#FFF4E5] text-[#D97706]";
  return "bg-[#FDECEF] text-[#E11D48]";
}

function date(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("fr-FR", { timeZone: getConfig().zonaHoraria, day: "numeric", month: "short" }).format(new Date(iso));
}

/** Mini tablero: las ultimas etapas abiertas y la ganada, con sus dos operaciones mas recientes. */
export function AffairesParEtape({ colonnes }: { colonnes: DatosTablero["porEtapa"] }) {
  return (
    <Carte titre="Affaires par étape" lien={{ href: "/pipeline", label: "Voir le pipeline" }}>
      {colonnes.length === 0 ? (
        <Vide>Aucune étape de pipeline configurée.</Vide>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {colonnes.map((c) => (
            <div key={c.etapa} className="min-w-0">
              <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
                <span className="truncate">{c.etapa}</span>
                <span className="ml-auto tabular-nums">{c.total}</span>
              </p>
              <div className="space-y-2">
                {c.operaciones.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border px-2.5 py-3 text-center text-[11px] text-muted-foreground">Vide</p>
                )}
                {c.operaciones.map((o) => (
                  <Link key={o.id} href="/pipeline" className="block rounded-xl border border-border bg-card p-2.5 hover:border-foreground/20 hover:shadow-sm transition">
                    <p className="truncate text-[12px] font-semibold">{o.titulo}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", badge(o.probabilidad))}>{o.probabilidad} %</span>
                      {date(o.cierre) && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {date(o.cierre)}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[8.5px] font-semibold", avatarBg(o.contacto ?? "?"))}>
                        {getInitials(o.contacto)}
                      </span>
                      <span className="truncate text-[10.5px] text-muted-foreground">{o.contacto ?? "Sans contact"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Carte>
  );
}
