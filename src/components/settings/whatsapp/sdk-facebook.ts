"use client";

import { VERSION_GRAPH_SDK, type OpcionesLoginMeta } from "@/lib/channels/meta-embedded-signup";

/**
 * Carga del SDK de Facebook, una sola vez por pagina. Se precarga al abrir el asistente:
 * FB.login tiene que correr dentro del click (si espera a que baje el script, el
 * navegador trata la ventana de Meta como popup no solicitado y la bloquea).
 */

interface RespuestaLogin {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface SdkFacebook {
  init(opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(cb: (r: RespuestaLogin) => void, opts: OpcionesLoginMeta): void;
}

declare global {
  interface Window {
    FB?: SdkFacebook;
    fbAsyncInit?: () => void;
  }
}

let cargando: Promise<SdkFacebook> | null = null;
let iniciadoCon: string | null = null;

export function cargarSdkFacebook(appId: string): Promise<SdkFacebook> {
  if (window.FB && iniciadoCon === appId) return Promise.resolve(window.FB);
  if (cargando) return cargando;

  cargando = new Promise<SdkFacebook>((resolve, reject) => {
    const iniciar = () => {
      if (!window.FB) return reject(new Error("SDK Facebook indisponible"));
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSION_GRAPH_SDK });
      iniciadoCon = appId;
      resolve(window.FB);
    };
    if (window.FB) return iniciar();

    window.fbAsyncInit = iniciar;
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/fr_FR/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      cargando = null;
      reject(new Error("Impossible de charger le SDK Facebook (bloqueur de publicites ?)"));
    };
    document.body.appendChild(script);
  });
  return cargando;
}

/** Abre la ventana de Meta. Llamar SOLO desde un click y con el SDK ya cargado. */
export function abrirVentanaMeta(opts: OpcionesLoginMeta): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.FB) return resolve(null);
    window.FB.login((r) => resolve(r.authResponse?.code ?? null), opts);
  });
}
