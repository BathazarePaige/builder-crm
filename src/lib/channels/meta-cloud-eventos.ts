import { isBsuid, normalizePhone, resolveRealPhone } from "@/lib/phone";

/**
 * Lectura del payload del webhook de WhatsApp Cloud API (Meta directo).
 *
 * Puro a proposito: no toca la base ni la red, asi que los tests lo cubren sin nada
 * levantado. La persistencia vive en `meta-cloud-ingesta.ts`, que consume lo que sale
 * de aca. Si Meta cambia la forma del payload, esto es lo unico que hay que tocar.
 *
 * Forma del payload (resumida):
 *   { object: "whatsapp_business_account",
 *     entry: [{ id: <waba>, changes: [{ field: "messages", value: {
 *       metadata: { display_phone_number, phone_number_id },
 *       contacts: [{ wa_id, profile: { name } }],
 *       messages: [{ id: <wamid>, from, timestamp, type, text: { body } ... }],
 *       statuses: [{ id: <wamid>, status, timestamp, recipient_id, errors }] } }] }] }
 */

export interface MetaInboundMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; caption?: string; mime_type?: string };
  audio?: { id: string; mime_type?: string };
  video?: { id: string; caption?: string; mime_type?: string };
  document?: { id: string; filename?: string; caption?: string; mime_type?: string };
  sticker?: { id: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  reaction?: { message_id?: string; emoji?: string };
  contacts?: unknown[];
}

export interface MetaContactProfile {
  wa_id: string;
  profile?: { name?: string };
}

export interface MetaStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed" | string;
  timestamp: string;
  recipient_id?: string;
  errors?: Array<{ code: number; title?: string; message?: string }>;
}

export interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: MetaContactProfile[];
  messages?: MetaInboundMessage[];
  statuses?: MetaStatus[];
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaChangeValue }>;
  }>;
}

/** Un mensaje entrante ya normalizado, listo para `ingest.ts`. */
export interface EntranteMeta {
  wamid: string;
  /** Telefono real en E.164 con "+". Nunca un BSUID. */
  telefono: string;
  /** BSUID de Coexistence si `wa_id` vino asi; se guarda como segunda identidad. */
  bsuid: string | null;
  nombre: string | null;
  tipo: string;
  cuerpo: string;
  enviadoEn: Date;
  crudo: MetaInboundMessage;
}

/** Un cambio de estado de un mensaje saliente. */
export interface EstadoMeta {
  wamid: string;
  status: string;
  en: Date;
  error: string | null;
}

/** Todo lo que trae un `change` de un numero (phone_number_id). */
export interface CambioMeta {
  phoneNumberId: string | null;
  telefonoNegocio: string | null;
  mensajes: EntranteMeta[];
  estados: EstadoMeta[];
}

export function esPayloadWhatsapp(payload: unknown): payload is MetaWebhookPayload {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as MetaWebhookPayload).object === "whatsapp_business_account"
  );
}

/** Recorre `entry[].changes[]` y devuelve solo los cambios de `messages`. */
export function leerCambiosMeta(payload: MetaWebhookPayload): CambioMeta[] {
  const cambios: CambioMeta[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value) continue;
      const value = change.value;

      const mensajes: EntranteMeta[] = [];
      for (const msg of value.messages ?? []) {
        if (!msg?.id || !msg.from) continue;
        // En lotes, `contacts[i]` corresponde al remitente: se busca por wa_id/from y,
        // si no aparece, se usa el primero (el caso normal es un solo contacto).
        const perfil =
          value.contacts?.find((c) => c.wa_id === msg.from) ?? value.contacts?.[0];
        mensajes.push(normalizarEntrante(msg, perfil));
      }

      const estados: EstadoMeta[] = [];
      for (const st of value.statuses ?? []) {
        if (!st?.id || !st.status) continue;
        estados.push({
          wamid: st.id,
          status: st.status,
          en: desdeEpoch(st.timestamp),
          error: st.status === "failed" ? JSON.stringify(st.errors ?? []) : null,
        });
      }

      cambios.push({
        phoneNumberId: value.metadata?.phone_number_id ?? null,
        telefonoNegocio: value.metadata?.display_phone_number
          ? `+${normalizePhone(value.metadata.display_phone_number)}`
          : null,
        mensajes,
        estados,
      });
    }
  }

  return cambios;
}

function normalizarEntrante(
  msg: MetaInboundMessage,
  perfil: MetaContactProfile | undefined
): EntranteMeta {
  // Gotcha A de Coexistence: wa_id puede ser un BSUID; el numero real esta en `from`.
  // Gotcha B: troncales de MX/AR, que normalizePhone corrige para no duplicar contactos.
  const real = resolveRealPhone(perfil?.wa_id, msg.from);
  const bsuid = perfil?.wa_id && isBsuid(perfil.wa_id) ? perfil.wa_id : null;
  const nombre = perfil?.profile?.name?.trim() || null;

  return {
    wamid: msg.id,
    telefono: `+${real}`,
    bsuid,
    nombre,
    tipo: msg.type,
    cuerpo: cuerpoDeMensaje(msg),
    enviadoEn: desdeEpoch(msg.timestamp),
    crudo: msg,
  };
}

/** Texto que se muestra en la bandeja y lee el agente. Mismo formato que Zernio. */
export function cuerpoDeMensaje(msg: MetaInboundMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "image":
      return msg.image?.caption ? `[imagen] ${msg.image.caption}` : "[imagen]";
    case "audio":
      return "[audio]";
    case "video":
      return msg.video?.caption ? `[video] ${msg.video.caption}` : "[video]";
    case "document":
      return msg.document?.filename ? `[documento] ${msg.document.filename}` : "[documento]";
    case "sticker":
      return "[sticker]";
    case "location": {
      const l = msg.location;
      return `[ubicacion] ${l?.name ?? l?.address ?? `${l?.latitude},${l?.longitude}`}`;
    }
    case "button":
      // Respuesta rapida de una plantilla: el texto del boton es lo que el cliente "dijo".
      return msg.button?.text ?? "[boton]";
    case "interactive":
      return (
        msg.interactive?.button_reply?.title ??
        msg.interactive?.list_reply?.title ??
        "[interactivo]"
      );
    case "reaction":
      return msg.reaction?.emoji ? `[reaccion] ${msg.reaction.emoji}` : "[reaccion]";
    default:
      return `[${msg.type}]`;
  }
}

/**
 * Id del evento para `webhook_events`. Meta no manda un id de entrega: se usa el del
 * primer elemento. Un `wamid` se repite en los estados (sent, delivered, read del mismo
 * mensaje), por eso el estado entra en el id; si no, el `read` se descartaria como
 * duplicado del `delivered`. null = el nucleo usa el hash del cuerpo.
 */
export function idEventoMeta(payload: unknown): string | null {
  if (!esPayloadWhatsapp(payload)) return null;
  for (const cambio of leerCambiosMeta(payload)) {
    const msg = cambio.mensajes[0];
    if (msg) return `meta:${msg.wamid}`;
    const st = cambio.estados[0];
    if (st) return `meta:${st.wamid}:${st.status}`;
  }
  return null;
}

/**
 * Handshake del hub de Meta: al registrar el webhook, Meta hace un GET con
 * `hub.mode=subscribe`, `hub.verify_token` y `hub.challenge`. Devuelve el challenge si
 * el token coincide, o null. Sin token configurado no acepta ninguno (fail-closed).
 */
export function respuestaHub(params: URLSearchParams, tokenEsperado: string): string | null {
  if (!tokenEsperado) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  if (params.get("hub.verify_token") !== tokenEsperado) return null;
  return params.get("hub.challenge") ?? "";
}

function desdeEpoch(ts: string | undefined): Date {
  const n = Number.parseInt(ts ?? "", 10);
  return Number.isFinite(n) ? new Date(n * 1000) : new Date();
}
