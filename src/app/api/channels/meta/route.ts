import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { conexionMetaSchema, urlWebhookMeta } from "@/lib/channels/meta-cloud-conexion";
import { whatsappProvider } from "@/lib/channels/provider";

export const dynamic = "force-dynamic";

/**
 * Conexion de un numero de WhatsApp por Meta Cloud API directo (sin Zernio).
 *
 *   GET    -> cuentas cargadas (sin token), URL del webhook y que falta del entorno.
 *   POST   -> valida el token contra Graph, suscribe la app al WABA y guarda la cuenta.
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
  const { phoneNumberId, accessToken } = parsed.data;
  const wabaId = parsed.data.wabaId || null;

  const [{ obtenerNumeroMeta, suscribirAppAWaba }, { conectarCuentaWhatsapp }, { resolveDefaultTenantId }] =
    await Promise.all([
      import("@/lib/meta-whatsapp"),
      import("@/lib/whatsapp-accounts"),
      import("@/lib/tenants"),
    ]);

  const numero = await obtenerNumeroMeta(phoneNumberId, accessToken);
  if (!numero.success) {
    return NextResponse.json(
      { error: `Meta rechazo el token o el id: ${numero.error.message ?? "sin detalle"}` },
      { status: 422 }
    );
  }

  const avisos: string[] = [];
  if (wabaId) {
    const sub = await suscribirAppAWaba(wabaId, accessToken);
    if (!sub.success) {
      avisos.push(
        `No se pudo suscribir la app al WABA (${sub.error?.message ?? "sin detalle"}): el numero va a enviar pero no a recibir hasta que se suscriba.`
      );
    }
  } else {
    avisos.push("Sin WABA id no se suscribe la app: hacelo desde el panel de Meta o pegalo y reconecta.");
  }

  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) {
    return NextResponse.json({ error: "No existe el tenant default: faltan migraciones" }, { status: 500 });
  }

  const cuenta = await conectarCuentaWhatsapp({
    tenantId,
    phoneNumberId,
    accessToken,
    wabaId,
    displayPhone: numero.numero.displayPhone,
  });

  if (whatsappProvider() !== "meta") {
    avisos.push("La cuenta quedo guardada, pero WhatsApp sigue saliendo por Zernio hasta que la instancia tenga WHATSAPP_PROVIDER=meta.");
  }

  return NextResponse.json({ ok: true, cuenta, nombre: numero.numero.verifiedName, avisos });
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
