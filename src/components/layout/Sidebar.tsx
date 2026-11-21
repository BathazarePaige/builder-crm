"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Users,
  Kanban,
  Activity,
  Settings,
  MessageSquare,
  BarChart3,
  FileText,
  Workflow,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { marca, moduloActivo } from "@/lib/config";
import { navModulos } from "@/lib/modules/cliente";
import { etiquetaVersion } from "@/lib/version";
import { useEsAdmin } from "@/lib/use-es-admin";
import { leerConfigPublica } from "@/lib/config-publica";
import { UserMenu } from "./UserMenu";
import { CartePromo } from "./CartePromo";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * El menu se arma desde la configuracion: las funciones del nucleo apagadas en
 * `modulos.nucleo` no aparecen, y los modulos activos agregan sus entradas en la
 * seccion que declaran en su manifiesto.
 */
function construirSecciones(esAdmin: boolean): NavSection[] {
  const deModulos = navModulos();
  const seccion = (nombre: "Operaciones" | "Productividad" | "Inteligencia"): NavItem[] =>
    deModulos
      .filter((n) => (n.seccion ?? "Operaciones") === nombre)
      .map((n) => ({ href: n.href, label: n.etiqueta, icon: n.icono }));
  const si = (activo: boolean, item: NavItem): NavItem[] => (activo ? [item] : []);

  // Las claves de seccion ("Operaciones"...) son las del contrato de modulos; lo
  // visible va en frances.
  return [
    {
      items: [
        { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
        { href: "/conversations", label: "Boîte de réception", icon: MessageSquare },
      ],
    },
    {
      title: "Ventes",
      items: [
        { href: "/pipeline", label: "Pipeline", icon: Kanban },
        { href: "/contacts", label: "Contacts", icon: Users },
        ...si(moduloActivo("plantillas"), { href: "/plantillas", label: "Modèles", icon: FileText }),
        ...seccion("Operaciones"),
      ],
    },
    {
      title: "Suivi",
      items: [
        ...si(moduloActivo("actividades"), { href: "/activities", label: "Activités", icon: Activity }),
        ...seccion("Productividad"),
      ],
    },
    {
      title: "Intelligence",
      items: [
        ...si(moduloActivo("reportes"), { href: "/reportes", label: "Rapports", icon: BarChart3 }),
        ...si(moduloActivo("automatizaciones"), { href: "/automatizaciones", label: "Automatisations", icon: Workflow }),
        ...si(esAdmin && moduloActivo("simulador"), { href: "/simulador", label: "Simulateur", icon: FlaskConical }),
        ...seccion("Inteligencia"),
      ],
    },
  ].filter((s) => s.items.length > 0);
}

const footerItems: NavItem[] = [
  { href: "/settings", label: "Réglages", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border min-h-screen sticky top-0 max-h-screen">
      <SidebarBrand />
      <SidebarNav className="flex-1" />
      <CartePromo />
      <SidebarFooter />
    </aside>
  );
}

export function SidebarBrand() {
  const m = marca();
  return (
    <div className="flex h-[72px] items-center gap-2.5 px-6">
      <Image
        src={m.logo}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="h-8 w-8 rounded-xl object-cover shrink-0"
      />
      <span className="text-[17px] font-semibold tracking-tight truncate">
        {m.nombre}
      </span>
    </div>
  );
}

export function SidebarNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const esAdmin = useEsAdmin() === true;
  const sections = construirSecciones(esAdmin);

  return (
    <nav aria-label="Navigation principale" className={cn("px-4 py-3 space-y-5 overflow-y-auto", className)}>
      {sections.map((section, idx) => (
        <div key={idx} className="space-y-1">
          {section.title && (
            <p className="px-3 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground-muted/80">
              {section.title}
            </p>
          )}
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors cursor-pointer",
        isActive
          ? "bg-gradient-to-r from-primary to-[#7C6CF5] text-white font-medium shadow-[0_6px_16px_-6px_rgba(59,107,246,0.6)]"
          : "text-sidebar-foreground-muted hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      <item.icon
        className={cn(
          "h-[18px] w-[18px] shrink-0",
          isActive ? "text-white" : "text-sidebar-foreground-muted",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function SidebarFooter() {
  const pathname = usePathname();
  return (
    <div className="border-t border-sidebar-border px-4 py-3 space-y-1">
      {footerItems.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <div className="pt-2">
        <UserMenu />
      </div>
      {leerConfigPublica().modoLocal && (
        <p
          className="mx-2.5 mt-2 rounded-md border border-sidebar-border bg-sidebar-accent px-2 py-1.5 text-[11px] leading-tight text-sidebar-foreground"
          title="Tourne sur votre machine avec une base embarquée et sans session : ce n'est pas une instance client"
        >
          <span className="font-semibold">Mode local</span> · sans connexion, données de test
        </p>
      )}
      <p className="px-2.5 pt-1 text-[11px] text-sidebar-foreground-muted" title="Version déployée">
        {etiquetaVersion()}
      </p>
    </div>
  );
}
