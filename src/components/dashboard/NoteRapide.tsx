"use client";

import { useEffect, useRef, useState } from "react";
import { Check, PencilLine } from "lucide-react";

const CLE = "tableau-de-bord:note-rapide";

/**
 * Nota libre de quien usa el tablero. Queda en el navegador (localStorage), no en la
 * base: es un borrador personal, no un dato del CRM.
 */
export function NoteRapide() {
  // Textarea no controlado: el valor guardado se carga despues de hidratar, sin que
  // el HTML del servidor (vacio) choque con el del navegador.
  const zone = useRef<HTMLTextAreaElement>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    try {
      if (zone.current) zone.current.value = localStorage.getItem(CLE) ?? "";
    } catch {}
  }, []);

  function sauver(valeur: string) {
    setEnregistre(false);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => {
      try {
        localStorage.setItem(CLE, valeur);
        setEnregistre(valeur.length > 0);
      } catch {}
    }, 500);
  }

  return (
    <section className="rounded-2xl border border-[#ECEEF3] bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] dark:border-border">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-tight">Note rapide</h2>
        {enregistre ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3" /> Enregistrée
          </span>
        ) : (
          <PencilLine className="h-4 w-4 text-muted-foreground" />
        )}
      </header>
      <textarea
        ref={zone}
        onChange={(e) => sauver(e.target.value)}
        placeholder="Écrivez quelque chose…"
        aria-label="Note rapide"
        rows={3}
        className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary-ink focus:ring-2 focus:ring-ring/20"
      />
      <p className="mt-1.5 text-[11px] text-muted-foreground">Gardée sur cet appareil uniquement.</p>
    </section>
  );
}
