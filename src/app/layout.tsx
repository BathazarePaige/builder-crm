import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NotificationChecker } from "@/components/shared/NotificationChecker";
import { PWARegister } from "@/components/shared/PWARegister";
import { AppShell } from "@/components/layout/AppShell";
import { getConfig, cssVariablesMarca } from "@/lib/config";
import { ID_CONFIG_PUBLICA, configPublicaSerializada } from "@/lib/config-publica";

// Todo lo visible de la marca sale de config/cliente.ts (zona del cliente).
export function generateMetadata(): Metadata {
  const { marca, idioma } = getConfig();
  return {
    title: { default: marca.nombre, template: `%s · ${marca.nombre}` },
    description: marca.descripcion,
    manifest: "/manifest.webmanifest",
    icons: { icon: marca.icono, apple: marca.icono },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: marca.nombreCorto,
    },
    other: { "x-idioma": idioma },
  };
}

export function generateViewport(): Viewport {
  const { marca } = getConfig();
  return {
    themeColor: marca.colorSidebar,
    width: "device-width",
    initialScale: 1,
    // Deja pintar debajo del notch; los paddings usan env(safe-area-inset-*).
    viewportFit: "cover",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { idioma } = getConfig();
  return (
    // translate="no" + notranslate: el traductor de Edge/Chrome reescribe los nodos de
    // texto por debajo de React y el siguiente render revienta con "removeChild".
    // suppressHydrationWarning en html/head/body/style: las extensiones les inyectan
    // atributos y estilos antes de hidratar; solo silencia ese nivel, no los hijos.
    <html lang={idioma} translate="no" className="h-full antialiased" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <meta name="google" content="notranslate" />
        {/* Colores de la marca en SSR: sin flash del color por defecto. */}
        <style
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: cssVariablesMarca() }}
        />
        {/* Config publica en tiempo de ejecucion: ver src/lib/config-publica.ts. */}
        <script
          id={ID_CONFIG_PUBLICA}
          type="application/json"
          dangerouslySetInnerHTML={{ __html: configPublicaSerializada() }}
        />
      </head>
      <body className="min-h-full bg-background" suppressHydrationWarning>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
          <Toaster />
          <NotificationChecker />
          <PWARegister />
        </TooltipProvider>
      </body>
    </html>
  );
}
