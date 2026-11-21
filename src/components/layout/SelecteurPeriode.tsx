"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leerPeriodo, PERIODOS } from "@/lib/tableau-de-bord/calculs";
import { zonaHoraria } from "@/lib/config";

function plage(jours: number): string {
  const fin = new Date();
  const debut = new Date(fin.getTime() - jours * 86_400_000);
  const f = new Intl.DateTimeFormat("fr-FR", { timeZone: zonaHoraria(), day: "numeric", month: "short" });
  const annee = new Intl.DateTimeFormat("fr-FR", { timeZone: zonaHoraria(), year: "numeric" }).format(fin);
  return `${f.format(debut)} – ${f.format(fin)} ${annee}`;
}

/** Periodo del tablero (?periode=7|30|90). Solo se muestra en la pagina de inicio. */
export function SelecteurPeriode() {
  const router = useRouter();
  const params = useSearchParams();
  const actuel = leerPeriodo(params.get("periode") ?? undefined);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hidden lg:inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-[13px] font-medium shadow-sm hover:bg-muted cursor-pointer">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        {plage(actuel)}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {PERIODOS.map((p) => (
          <DropdownMenuItem key={p} onClick={() => router.push(p === 7 ? "/" : `/?periode=${p}`)} className="cursor-pointer text-[13px]">
            {p} derniers jours
            {p === actuel && <span className="ml-auto text-primary-ink">•</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
