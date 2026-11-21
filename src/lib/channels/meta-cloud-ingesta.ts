import "server-only";
import { getAccountByPhoneNumberId } from "@/lib/whatsapp-accounts";
import { metaWebhookActive } from "./provider";
import {
  findOrCreateContactByIdentity,
  ingestMessage,
  linkExtraIdentity,
  updateMessageStatus,
  upsertConversation,
} from "./ingest";
import { esPayloadWhatsapp, leerCambiosMeta } from "./meta-cloud-eventos";
import type { ResultadoWebhook } from "./conector";

/**
 * Ingesta del webhook de WhatsApp Cloud API. La llama `metaCloud.webhook.procesar`
 * dentro de `after()`, por import dinamico: arrastra la base y la cola del agente.
 *
 * Antes vivia inline en `/api/webhooks/whatsapp` con su propio insert de mensajes. Ahora
 * persiste con las mismas funciones que Zernio, asi que la idempotencia (indice unico de
 * `messages.external_id`), la reactivacion por inactividad y el filtro de mensajes
 * viejos son los mismos para los dos conectores.
 */
export async function procesarEventoMeta(payload: unknown): Promise<ResultadoWebhook> {
  if (!esPayloadWhatsapp(payload)) {
    return { status: "ignored", reason: "objeto distinto de whatsapp_business_account", jobIds: [] };
  }

  // Con WhatsApp por Zernio, este conector no ingesta: si los dos caminos guardaran el
  // mismo mensaje, el agente contestaria dos veces. Meta igual recibe su 200.
  if (!metaWebhookActive()) {
    return { status: "ignored", reason: "whatsapp_provider=zernio", jobIds: [] };
  }

  const jobIds: string[] = [];
  let procesados = 0;
  let estadosPendientes = 0;
  const ignorados: string[] = [];

  for (const cambio of leerCambiosMeta(payload)) {
    // Solo los numeros de nuestra tabla: otro numero que comparta la app de Meta no es
    // nuestro, y crear contactos con sus mensajes seria basura (o robarselos).
    const cuenta = await getAccountByPhoneNumberId(cambio.phoneNumberId);
    if (!cuenta) {
      ignorados.push(`phone_number_id no registrado: ${cambio.phoneNumberId}`);
      continue;
    }

    for (const m of cambio.mensajes) {
      const contactId = await findOrCreateContactByIdentity({
        tenantId: cuenta.tenantId,
        channel: "whatsapp",
        externalId: m.telefono,
        name: m.nombre,
      });
      if (m.bsuid) await linkExtraIdentity(contactId, "whatsapp", m.bsuid);

      // `legacy:<contactId>` es el external_id que uso la migracion para los hilos de
      // Meta directo: mantenerlo hace que el hilo existente siga siendo el mismo.
      const conversation = await upsertConversation({
        tenantId: cuenta.tenantId,
        contactId,
        accountId: null,
        channel: "whatsapp",
        provider: "meta",
        externalId: `legacy:${contactId}`,
        participantId: m.telefono,
        participantName: m.nombre,
      });

      const r = await ingestMessage({
        conversation,
        direction: "in",
        externalId: m.wamid,
        body: m.cuerpo,
        type: m.tipo,
        sentAt: m.enviadoEn,
        rawPayload: m.crudo,
      });
      if (r.jobId) jobIds.push(r.jobId);
      procesados++;
    }

    // Coexistencia: lo que el negocio contesto desde el celular entra como saliente. No
    // encola al agente (ingestMessage solo encola lo entrante).
    for (const eco of cambio.ecos) {
      const contactId = await findOrCreateContactByIdentity({
        tenantId: cuenta.tenantId,
        channel: "whatsapp",
        externalId: eco.telefono,
      });
      const conversation = await upsertConversation({
        tenantId: cuenta.tenantId,
        contactId,
        accountId: null,
        channel: "whatsapp",
        provider: "meta",
        externalId: `legacy:${contactId}`,
        participantId: eco.telefono,
      });
      await ingestMessage({
        conversation,
        direction: "out",
        externalId: eco.wamid,
        body: eco.cuerpo,
        type: eco.tipo,
        sentAt: eco.enviadoEn,
        rawPayload: eco.crudo,
      });
      procesados++;
    }

    for (const st of cambio.estados) {
      const ok = await updateMessageStatus({
        externalId: st.wamid,
        status: st.status,
        deliveredAt: st.status === "delivered" ? st.en : null,
        readAt: st.status === "read" ? st.en : null,
        ...(st.error !== null ? { errorMessage: st.error } : {}),
      });
      if (ok) procesados++;
      else estadosPendientes++;
    }
  }

  // Un estado de un mensaje que todavia no existe (el `sent` llega antes de que
  // `deliverMessage` guarde el wamid): se reintenta en el barrido en vez de perderlo.
  if (estadosPendientes > 0) {
    return { status: "retry", reason: `${estadosPendientes} estado(s) sin mensaje todavia`, jobIds };
  }
  if (procesados === 0) {
    return { status: "ignored", reason: ignorados[0] ?? "sin mensajes ni estados", jobIds };
  }
  return { status: "processed", jobIds };
}
