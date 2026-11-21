"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import Image from "next/image";
import { marca } from "@/lib/config";
import { etiquetaVersion } from "@/lib/version";

const AUTH_PATHS = ["/login", "/signup"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute =
    AUTH_PATHS.includes(pathname) || pathname.startsWith("/auth");

  const m = marca();

  if (isAuthRoute) {
    return (
      <div className="min-h-screen flex">
        <aside className="hidden md:flex md:w-1/2 lg:w-2/5 bg-sidebar text-sidebar-foreground border-r border-sidebar-border p-12 flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src={m.logo}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 rounded-lg object-cover shrink-0"
            />
            <span className="text-base font-semibold tracking-tight">{m.nombre}</span>
          </div>
          <div className="space-y-5 max-w-md">
            <p className="text-3xl lg:text-[34px] font-semibold tracking-tight leading-[1.15] text-balance">
              Vos conversations WhatsApp, Instagram et Messenger, au même endroit.
            </p>
            <p className="text-sm text-sidebar-foreground-muted leading-relaxed">
              {m.descripcion}
            </p>
          </div>
          <p className="text-xs text-sidebar-foreground-muted">{etiquetaVersion()}</p>
        </aside>

        <div className="flex-1 flex items-center justify-center p-6 md:p-10 bg-background">
          <div className="w-full max-w-sm space-y-7">
            <div className="md:hidden flex items-center justify-center gap-2.5">
              <Image
                src={m.logo}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="h-8 w-8 rounded-lg object-cover shrink-0"
              />
              <span className="text-lg font-semibold tracking-tight">
                {m.nombre}
              </span>
            </div>

            <div className="space-y-6">{children}</div>

            <p className="text-center text-xs text-muted-foreground">
              En continuant, vous acceptez les conditions et la politique de confidentialité.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto max-w-[1760px] px-4 py-6 md:px-8 md:py-8 min-w-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
