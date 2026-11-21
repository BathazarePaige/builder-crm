"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { cn } from "@/lib/utils";
import { Carte, Vide } from "./Carte";

type Tache = DatosTablero["tareas"][number];

/** Prioridad visible: atrasada = haute, de hoy = moyenne. */
function priorite(t: Tache) {
  if (t.hecha) return { label: "Terminée", cls: "text-muted-foreground" };
  if (t.atrasada) return { label: "En retard", cls: "bg-[#FDECEF] text-[#E11D48]" };
  return { label: "Aujourd’hui", cls: "bg-[#FFF4E5] text-[#D97706]" };
}

export function TachesDuJour({ taches: initiales }: { taches: Tache[] }) {
  const [taches, setTaches] = useState(initiales);
  const faites = taches.filter((t) => t.hecha).length;
  const pct = taches.length ? Math.round((faites / taches.length) * 100) : 0;

  async function terminer(id: string) {
    setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, hecha: true } : t)));
    const res = await fetch(`/api/activities/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedAt: true }),
    }).catch(() => null);
    if (!res?.ok) {
      setTaches((ts) => ts.map((t) => (t.id === id ? { ...t, hecha: false } : t)));
      toast.error("Impossible de terminer la tâche");
    }
  }

  return (
    <Carte titre="Tâches du jour" lien={{ href: "/activities", label: "Voir tout" }}>
      {taches.length === 0 ? (
        <Vide>Aucune tâche pour aujourd’hui.</Vide>
      ) : (
        <>
          <ul className="space-y-3">
            {taches.map((t) => {
              const p = priorite(t);
              return (
                <li key={t.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={t.hecha}
                    aria-label={t.hecha ? "Tâche terminée" : "Marquer comme terminée"}
                    disabled={t.hecha}
                    onClick={() => terminer(t.id)}
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      t.hecha ? "border-primary bg-primary text-primary-foreground" : "cursor-pointer border-[#CDD3DE] hover:border-primary-ink",
                    )}
                  >
                    {t.hecha && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", t.hecha && "text-muted-foreground line-through")} title={`${t.descripcion} · ${t.contacto}`}>
                    {t.descripcion}
                  </span>
                  <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium", p.cls)}>{p.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              {faites} sur {taches.length} tâche{taches.length > 1 ? "s" : ""} terminée{faites > 1 ? "s" : ""}
            </span>
            <span>{pct} %</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-primary to-[#7C5CF5] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </Carte>
  );
}
