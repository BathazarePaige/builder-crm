import Link from "next/link";
import { Plus } from "lucide-react";
import { getConfig } from "@/lib/config";
import { ACTIVITY_TYPE_CONFIG } from "@/lib/constants";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import type { ActivityType } from "@/types";
import { Carte, Vide } from "./Carte";

function parties(iso: string) {
  const tz = getConfig().zonaHoraria;
  const d = new Date(iso);
  return {
    mois: new Intl.DateTimeFormat("fr-FR", { timeZone: tz, month: "short" }).format(d).replace(".", "").toUpperCase(),
    jour: new Intl.DateTimeFormat("fr-FR", { timeZone: tz, day: "numeric" }).format(d),
    heure: new Intl.DateTimeFormat("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

/** Proximas actividades con fecha (llamadas, reuniones, relances) que no estan hechas. */
export function EvenementsAVenir({ evenements }: { evenements: DatosTablero["eventos"] }) {
  return (
    <Carte titre="Événements à venir" lien={{ href: "/activities", label: "Voir l’agenda" }}>
      {evenements.length === 0 ? (
        <Vide>Rien de prévu pour l’instant.</Vide>
      ) : (
        <ul className="divide-y divide-border/70">
          {evenements.map((e) => {
            const p = parties(e.fecha);
            const type = ACTIVITY_TYPE_CONFIG[e.tipo as ActivityType]?.label ?? "Activité";
            return (
              <li key={e.id} className="flex items-center gap-3.5 py-3 first:pt-0">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F1F4FF] dark:bg-muted">
                  <span className="text-[9.5px] font-semibold tracking-wide text-primary-ink">{p.mois}</span>
                  <span className="text-[16px] font-semibold leading-none">{p.jour}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{e.descripcion}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {p.heure} · {type} · {e.contacto}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/activities"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[12.5px] font-medium hover:bg-muted"
      >
        <Plus className="h-3.5 w-3.5" /> Ajouter un événement
      </Link>
    </Carte>
  );
}
