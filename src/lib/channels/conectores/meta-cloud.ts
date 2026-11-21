import "server-only";
import { verifyWebhookSignature } from "@/lib/meta-whatsapp";
import { idEventoMeta } from "../meta-cloud-eventos";
import type { Conector, EstadoConector } from "../conector";

/**
 * Conector Meta Cloud API (WhatsApp directo, sin Zernio).
 *
 *  - `enviar`: texto y plantillas por Graph API (src/lib/meta-whatsapp.ts), con las
 *    credenciales de `whatsapp_accounts` o del entorno (WHATSAPP_*).
 *  - `webhook`: firma `X-Hub-Signature-256` con WHATSAPP_APP_SECRET, id de evento por
 *    `wamid` y la ingesta en `../meta-cloud-ingesta.ts` (import dinamico). La ruta es
 *    `/api/webhooks/whatsapp`, que suma el GET del handshake del hub.
 *  - `estado`: que falta para operar.
 *
 * Los numeros se conectan desde Ajustes -> Canales (`/api/channels/meta`), que valida
 * el token contra Graph y suscribe la app al WABA. Embedded Signup queda pendiente.
 *
 * Se activa como transporte de WhatsApp con WHATSAPP_PROVIDER=meta. Con Zernio como
 * proveedor, el webhook responde 200 y no ingesta (si no, el agente contestaria dos veces).
 */
export const metaCloud: Conector = {
  id: "meta",
  nombre: "Meta Cloud API (WhatsApp direct)",
  canales: ["whatsapp"],

  async enviar(ctx, msg) {
    const to = ctx.conversation.participantId;
    if (!to) {
      return { success: false, error: { message: "La conversation n’a pas de numéro de destination" } };
    }

    const [{ sendTextMessage, sendTemplateMessage }, { getAccountByTenant }] = await Promise.all([
      import("@/lib/meta-whatsapp"),
      import("@/lib/whatsapp-accounts"),
    ]);

    const account = await getAccountByTenant(ctx.conversation.tenantId);

    const result = msg.template
      ? await sendTemplateMessage(
          account,
          to,
          msg.template.name,
          msg.template.language ?? "es",
          msg.template.components ?? []
        )
      : await sendTextMessage(account, to, msg.text ?? "");

    if (!result.success) {
      return {
        success: false,
        error: { message: result.error?.message, code: result.error?.code },
        hint: hintForMetaError(result.error?.code),
      };
    }

    return { success: true, externalId: result.messageId ?? null };
  },

  webhook: {
    verificar(rawBody, headers) {
      return verifyWebhookSignature(rawBody, headers.get("x-hub-signature-256"));
    },
    idEvento(_rawBody, _headers, payload) {
      return idEventoMeta(payload);
    },
    async procesar(payload) {
      const { procesarEventoMeta } = await import("../meta-cloud-ingesta");
      return procesarEventoMeta(payload);
    },
  },

  async estado(): Promise<EstadoConector> {
    const activo = (process.env.WHATSAPP_PROVIDER || "zernio").toLowerCase() === "meta";
    const faltan: string[] = [];
    let cuentas: EstadoConector["cuentas"] = [];

    try {
      const { listarCuentasWhatsapp } = await import("@/lib/whatsapp-accounts");
      cuentas = (await listarCuentasWhatsapp())
        .filter((c) => c.status === "active")
        .map((c) => ({
          id: c.id,
          canal: "whatsapp" as const,
          nombre: c.displayPhone ?? c.phoneNumberId,
          estado: c.tieneToken ? "active" : "sin token",
        }));
    } catch {
      /* sin base o sin tabla: se evalua solo por entorno */
    }

    if (cuentas.length === 0) {
      if (!process.env.WHATSAPP_ACCESS_TOKEN) faltan.push("WHATSAPP_ACCESS_TOKEN");
      if (!process.env.WHATSAPP_PHONE_NUMBER_ID) faltan.push("WHATSAPP_PHONE_NUMBER_ID");
    }
    if (!process.env.WHATSAPP_APP_SECRET) faltan.push("WHATSAPP_APP_SECRET");
    if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) faltan.push("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

    const notas = [
      activo
        ? "Actif comme transport WhatsApp (WHATSAPP_PROVIDER=meta). Les messages arrivent par /api/webhooks/whatsapp."
        : "Inactif : WhatsApp passe par Zernio. Pour l’utiliser, WHATSAPP_PROVIDER=meta.",
    ];
    if (activo && cuentas.length === 0) {
      notas.push("Aucun numéro connecté : connecte-le plus bas, dans WhatsApp direct.");
    }

    return {
      id: "meta",
      nombre: "Meta Cloud API (WhatsApp direct)",
      configurado: faltan.length === 0,
      faltan,
      cuentas,
      notas,
    };
  },
};

/** Codigos de Graph mas comunes, en lenguaje humano. */
function hintForMetaError(code: number | undefined): string | undefined {
  switch (code) {
    case 131030:
      return "Le numéro n’est pas dans la liste des destinataires autorisés de l’app Meta.";
    case 131047:
      return "Plus de 24 h depuis le dernier message du client : il faut utiliser un modèle approuvé.";
    case 132000:
      return "Le modèle ne correspond pas au nombre de variables attendu.";
    case 190:
      return "Le jeton d’accès Meta a expiré.";
    default:
      return undefined;
  }
}
