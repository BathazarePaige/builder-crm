"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Search, Menu, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { marca } from "@/lib/config";
import { getInitials } from "@/lib/avatar";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "./NotificationBell";
import { SelecteurPeriode } from "./SelecteurPeriode";

/** Iniciales de quien esta conectado, para el avatar de la derecha. */
function useNomMembre(): string | null {
  const [nom, setNom] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    fetch("/api/team/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const m = d?.member;
        if (vivant && m) setNom(m.name || m.email?.split("@")[0] || null);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);
  return nom;
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();
  const nom = useNomMembre();
  const m = marca();

  return (
    <header className="sticky top-0 z-30 flex h-[72px] box-content pt-[env(safe-area-inset-top)] items-center gap-3 border-b border-border/70 bg-background/85 backdrop-blur-md px-4 md:px-8">
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" aria-label="Ouvrir le menu" className="md:hidden cursor-pointer h-9 w-9" />}
        >
          <Menu className="h-4 w-4" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <MobileNav />
        </SheetContent>
      </Sheet>

      <div className="hidden lg:flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 shadow-sm">
        <Image src={m.logo} alt="" width={20} height={20} unoptimized className="h-5 w-5 rounded-md object-cover" />
        <span className="max-w-[140px] truncate text-[13px] font-medium">{m.nombre}</span>
      </div>

      <div className="flex flex-1 justify-center">
        <div className="relative w-full max-w-[480px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Rechercher un contact, une conversation…"
            aria-label="Rechercher"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-xl border-border bg-card pl-10 pr-12 text-[13px] shadow-sm focus:ring-2 focus:ring-ring/20"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      {pathname === "/" && (
        <Suspense fallback={null}>
          <SelecteurPeriode />
        </Suspense>
      )}

      <div className="flex items-center gap-1.5">
        <NotificationBell />
        <Link
          href="/reportes"
          aria-label="Analyses"
          title="Analyses"
          className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#7C5CF5] hover:bg-muted"
        >
          <Sparkles className="h-[18px] w-[18px]" />
        </Link>
        <Link
          href="/settings"
          aria-label="Mon profil"
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#7C5CF5] text-[12px] font-semibold text-white ring-2 ring-card shadow-sm"
        >
          {nom ? getInitials(nom) : ""}
        </Link>
      </div>
    </header>
  );
}
