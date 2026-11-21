"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronsUpDown, LogOut, Settings, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { leerConfigPublica } from "@/lib/config-publica";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface SessionUser {
  email: string | null;
  fullName: string | null;
}

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function UserMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [cargando, setCargando] = useState(true);
  const [, startTransition] = useTransition();

  // Se lee del CRM, no del cliente de Supabase del navegador: el nombre y el rol que
  // importan estan en team_members, y asi el menu no depende de que el navegador pueda
  // hablar con el servidor de autenticacion. Pase lo que pase deja de cargar: antes,
  // si esa llamada fallaba, el pie del menu lateral se quedaba en gris para siempre.
  useEffect(() => {
    let vivo = true;
    fetch("/api/team/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((datos) => {
        if (!vivo) return;
        const miembro = datos?.member;
        if (miembro) setUser({ email: miembro.email ?? null, fullName: miembro.name ?? null });
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!user && !cargando) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs text-sidebar-foreground-muted">
        Session indisponible
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
        <div className="h-8 w-8 rounded-full bg-sidebar-accent animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-2.5 w-20 rounded bg-sidebar-accent animate-pulse" />
          <div className="h-2 w-28 rounded bg-sidebar-accent animate-pulse" />
        </div>
      </div>
    );
  }

  const displayName = user.fullName || user.email?.split("@")[0] || "Utilisateur";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sidebar-accent transition-colors cursor-pointer" />
        }
      >
        <div className="relative shrink-0">
          <Avatar className="h-8 w-8 rounded-full">
            <AvatarFallback className="rounded-full bg-accent text-accent-foreground text-[11px] font-semibold">
              {initials(user.fullName, user.email)}
            </AvatarFallback>
          </Avatar>
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-sidebar"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate text-sidebar-foreground">
            {displayName}
          </p>
          <p className="text-[11px] text-sidebar-foreground-muted truncate">
            {user.email}
          </p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 text-sidebar-foreground-muted shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        {/* Base UI exige que la etiqueta viva dentro de un grupo: suelta, el menu
            revienta al abrirse y se lleva la pagina entera. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/settings" />}>
          <UserIcon className="h-4 w-4" />
          Mon profil
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Settings className="h-4 w-4" />
          Réglages
        </DropdownMenuItem>
        {/* En modo local no hay sesion: el boton no tendria a donde ir y dejaria la
            pantalla en blanco. */}
        {!leerConfigPublica().modoLocal && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => startTransition(() => signOut())}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Se déconnecter
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
