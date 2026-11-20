import { NextRequest, NextResponse } from "next/server";
import { metaCloud } from "@/lib/channels/conectores/meta-cloud";
import { manejarWebhook, barrerWebhook } from "@/lib/channels/webhook";
import { respuestaHub } from "@/lib/channels/meta-cloud-eventos";

/**
 * Webhook de WhatsApp Cloud API (Meta directo). La mecanica (firma, idempotencia,
 * after(), barrido) es la generica de src/lib/channels/webhook.ts; lo propio de Meta
 * esta en el conector `meta-cloud.ts`.
 *
 * Esta URL es la registrada en la app de Meta (y la de `override_callback_uri` por WABA
 * para Tech Provider): no cambiarla. Publica por el prefijo /api/webhooks.
 *
 * GET hace dos cosas: el handshake del hub (`hub.mode=subscribe`) cuando se registra el
 * webhook en Meta, y el barrido con AGENT_WORKER_SECRET para lo que quedo colgado.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (request: NextRequest) => manejarWebhook(metaCloud, request);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (!params.has("hub.mode")) return barrerWebhook(metaCloud, request);

  const challenge = respuestaHub(params, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || "");
  if (challenge === null) {
    console.warn("[whatsapp-webhook] handshake del hub rechazado");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}
