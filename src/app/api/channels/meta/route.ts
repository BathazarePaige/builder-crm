import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { conexionMetaSchema, urlWebhookMeta } from "@/lib/channels/meta-cloud-conexion";
import { whatsappProvider } from "@/lib/channels/provider";
import { faltanParaSignup } from "@/lib/channels/meta-embedded-signup";

export const dynamic = "force-dynamic";

/**
 * Conexion de un numero de WhatsApp por Meta Cloud API directo (sin Zernio).
 *
 *   GET    -> cuentas cargadas (sin token), URL del webhook y que falta del entorno.
 *   POST   -> carga manual: valida el token contra Graph, suscribe la app al WABA y guarda.
 *             La ventana de Meta (Embedded Signup) va por ./embedded.
 *   DELETE -> ?id=<uuid> desconecta (borra el token, deja la fila).
 *
 * Solo admin: el token da control total del numero.
 */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { listarCuentasWhatsapp } = await import("@/lib/whatsapp-accounts");
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";

  return NextResponse.json({
    activo: whatsappProvider() === "meta",
    cuentas: await listarCuentasWhatsapp(),
    webhookUrl: base ? urlWebhookMeta(base) : null,
    tieneAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
    tieneVerifyToken: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    // Ventana de Meta (Embedded Signup). El app id y el config id son publicos: viajan
    // igual en la URL del popup de Meta. El secreto de la app nunca sale de aca.
    signup: {
      appId: process.env.META_APP_ID || null,
      configId: process.env.META_ES_CONFIG_ID || null,
      faltan: faltanParaSignup(process.env),
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const parsed = conexionMetaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos invalidos" },
      { status: 400 }
    );
  }
  const { darDeAltaNumero } = await import("@/lib/channels/meta-cloud-alta");
  const r = await darDeAltaNumero({
    phoneNumberId: parsed.data.phoneNumberId,
    accessToken: parsed.data.accessToken,
    wabaId: parsed.data.wabaId || null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const { desconectarCuentaWhatsapp } = await import("@/lib/whatsapp-accounts");
  const ok = await desconectarCuentaWhatsapp(id);
  if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
