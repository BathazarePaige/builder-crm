import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Contenedor comun de los bloques del tablero: titulo, subtitulo opcional y una accion
 * a la derecha (enlace "Voir tout" o un selector).
 */
export function Carte({
  titre,
  sousTitre,
  action,
  lien,
  badge,
  className,
  children,
}: {
  titre: string;
  sousTitre?: string;
  action?: ReactNode;
  lien?: { href: string; label: string };
  badge?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#ECEEF3] bg-card p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] min-w-0 dark:border-border",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
            {titre}
            {badge}
          </h2>
          {sousTitre && <p className="mt-1 text-[12.5px] text-muted-foreground">{sousTitre}</p>}
        </div>
        {action}
        {lien && (
          <Link href={lien.href} className="shrink-0 text-[12.5px] font-medium text-primary-ink hover:underline">
            {lien.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted-foreground">{children}</p>;
}
