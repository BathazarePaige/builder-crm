import { z } from "zod";

/**
 * Embedded Signup de Meta: la ventana de Meta donde el cliente entra con Facebook,
 * elige o crea su cuenta de WhatsApp Business y conecta el numero. Puro (sin base ni
 * red, sin `window`): lo usan el asistente del navegador y la ruta del servidor, y lo
 * cubren los tests.
 *
 * Flujo:
 *   1. El navegador carga el SDK de Facebook y llama `FB.login(cb, opcionesLogin(...))`.
 *   2. Mientras la ventana esta abierta, Meta manda `postMessage` desde facebook.com con
 *      `{ type: "WA_EMBEDDED_SIGNUP", event, data: { phone_number_id, waba_id } }`.
 *   3. Al cerrar, `cb` recibe `authResponse.code` (vale 30 segundos).
 *   4. El navegador manda code + ids a `/api/channels/meta/embedded`, que cambia el code
 *      por el token del negocio con el secreto de la app. El token nunca pasa por aca.
 */

/**
 * - `coexistencia`: el numero ya esta en la app WhatsApp Business del celular y sigue
 *   ahi. Meta pide escanear un QR desde la app. No se registra el numero (ya lo esta).
 * - `nuevo`: un numero que no esta en WhatsApp (o que se libero). Meta lo verifica por
 *   SMS o llamada y despues hay que registrarlo en Cloud API con un PIN.
 */
export type ModoAlta = "coexistencia" | "nuevo";

export const VERSION_GRAPH_SDK = "v22.0";

export interface OpcionesLoginMeta {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  extras: {
    setup: Record<string, never>;
    featureType?: "whatsapp_business_app_onboarding";
    sessionInfoVersion: "3";
  };
}

export function opcionesLogin(modo: ModoAlta, configId: string): OpcionesLoginMeta {
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    extras: {
      setup: {},
      // Sin esto, Meta trata al numero como nuevo y uno que esta en la app WhatsApp
      // Business aparece como "no cumple los requisitos".
      ...(modo === "coexistencia" ? { featureType: "whatsapp_business_app_onboarding" as const } : {}),
      sessionInfoVersion: "3",
    },
  };
}

export type EventoSignup =
  | { tipo: "fin"; phoneNumberId: string; wabaId: string; coexistencia: boolean }
  | { tipo: "fin_sin_numero"; wabaId: string | null }
  | { tipo: "cancelado"; paso: string | null }
  | { tipo: "error"; mensaje: string };

/**
 * Lee un `postMessage` de la ventana de Meta. Devuelve null si no es de Meta o no es
 * de Embedded Signup: cualquier pestana o extension puede mandar mensajes a la pagina,
 * asi que el origen se valida aca y no en cada llamador.
 */
export function leerEventoSignup(origen: string, datos: unknown): EventoSignup | null {
  if (!esOrigenFacebook(origen)) return null;

  let msg: unknown = datos;
  if (typeof datos === "string") {
    try {
      msg = JSON.parse(datos);
    } catch {
      return null;
    }
  }
  if (typeof msg !== "object" || msg === null) return null;
  const m = msg as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (m.type !== "WA_EMBEDDED_SIGNUP") return null;

  const d = m.data ?? {};
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);

  switch (m.event) {
    case "FINISH":
    case "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING": {
      const phoneNumberId = texto(d.phone_number_id);
      const wabaId = texto(d.waba_id);
      if (!phoneNumberId || !wabaId) return { tipo: "fin_sin_numero", wabaId };
      return {
        tipo: "fin",
        phoneNumberId,
        wabaId,
        coexistencia: m.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      };
    }
    case "FINISH_ONLY_WABA":
      return { tipo: "fin_sin_numero", wabaId: texto(d.waba_id) };
    case "CANCEL":
      return { tipo: "cancelado", paso: texto(d.current_step) };
    case "ERROR":
      return { tipo: "error", mensaje: texto(d.error_message) ?? "Erreur dans la fenêtre de Meta" };
    default:
      return null;
  }
}

function esOrigenFacebook(origen: string): boolean {
  try {
    const u = new URL(origen);
    return u.protocol === "https:" && (u.hostname === "facebook.com" || u.hostname.endsWith(".facebook.com"));
  } catch {
    return false;
  }
}

const idMeta = z.string().trim().regex(/^\d{5,25}$/, "Identifiant Meta invalide");

/** Lo que el navegador manda al servidor al terminar la ventana de Meta. */
export const altaEmbebidaSchema = z.object({
  code: z.string().trim().min(10, "Code Meta manquant").max(2048),
  phoneNumberId: idMeta,
  wabaId: idMeta,
  modo: z.enum(["coexistencia", "nuevo"]),
});

export type AltaEmbebida = z.infer<typeof altaEmbebidaSchema>;

/** Que falta en el entorno para ofrecer la ventana de Meta. */
export function faltanParaSignup(env: Record<string, string | undefined>): string[] {
  const faltan: string[] = [];
  if (!env.META_APP_ID) faltan.push("META_APP_ID");
  if (!env.META_ES_CONFIG_ID) faltan.push("META_ES_CONFIG_ID");
  if (!env.WHATSAPP_APP_SECRET) faltan.push("WHATSAPP_APP_SECRET");
  return faltan;
}

/**
 * PIN de verificacion en dos pasos para registrar un numero nuevo en Cloud API. Si la
 * instancia define WHATSAPP_TWO_STEP_PIN se usa ese; si no, uno al azar que se muestra
 * una sola vez al administrador (Meta lo pide si el numero se vuelve a registrar).
 */
export function pinRegistro(
  configurado: string | undefined,
  azar: () => number = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
): string {
  if (configurado && /^\d{6}$/.test(configurado)) return configurado;
  return String(Math.floor(azar() * 1_000_000)).padStart(6, "0");
}
