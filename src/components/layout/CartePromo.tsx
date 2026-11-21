"use client";

import Link from "next/link";
import { ArrowRight, MessageCircle, Rocket } from "lucide-react";
import { useEsAdmin } from "@/lib/use-es-admin";

/**
 * Tarjeta del pie del menu: lleva a conectar los canales (lo primero que hay que hacer
 * en una instancia nueva). Solo para admin, que es quien puede conectarlos. Se oculta
 * en pantallas bajas para no tapar el menu.
 */
export function CartePromo() {
  if (useEsAdmin() !== true) return null;
  return (
    <div className="mx-4 mb-3 hidden rounded-2xl bg-gradient-to-br from-[#EEF2FF] to-[#F5F0FF] p-4 [@media(min-height:820px)]:block dark:from-sidebar-accent dark:to-sidebar-accent">
      <div className="relative mb-3 flex h-16 items-center justify-center">
        <span className="absolute left-3 top-1 h-2 w-2 rounded-full bg-[#C7D2FE]" />
        <span className="absolute right-6 top-3 h-1.5 w-1.5 rounded-full bg-[#DDD6FE]" />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#7C6CF5] text-white shadow-[0_10px_24px_-10px_rgba(59,107,246,0.7)] -rotate-6">
          <Rocket className="h-7 w-7" />
        </div>
        <div className="absolute bottom-0 right-4 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#25D366] shadow-sm dark:bg-card">
          <MessageCircle className="h-4 w-4" />
        </div>
      </div>
      <p className="text-[13.5px] font-semibold text-foreground">Connectez vos canaux</p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
        WhatsApp, Instagram et Messenger : l’agent IA répond dès le premier message.
      </p>
      <Link
        href="/settings#canaux"
        className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-[#7C6CF5] py-2 text-[12.5px] font-semibold text-white shadow-sm hover:opacity-95"
      >
        Connecter <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
