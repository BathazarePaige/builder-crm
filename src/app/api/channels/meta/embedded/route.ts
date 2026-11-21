import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { altaEmbebidaSchema, faltanParaSignup, pinRegistro } from "@/lib/channels/meta-embedded-signup";

export const dynamic = "force-dynamic";

/**
 * Cierre de la ventana de Meta (Embedded Signup). El navegador manda el `code` de
 * FB.login y los ids que Meta informo por postMessage; aca se cambia el code por el
 * token del negocio con WHATSAPP_APP_SECRET, se registra el numero si es nuevo, se
 * suscribe la app al WABA y se guarda la cuenta. Solo admin.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const faltan = faltanParaSignup(process.env);
  if (faltan.length > 0) {
    return NextResponse.json({ error: `Configuration Meta incomplete : ${faltan.join(", ")}` }, { status: 409 });
  }

  const parsed = altaEmbebidaSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Donnees invalides" }, { status: 400 });
  }
  const { code, phoneNumberId, wabaId, modo } = parsed.data;

  const [{ intercambiarCodigoMeta }, { darDeAltaNumero }] = await Promise.all([
    import("@/lib/meta-whatsapp"),
    import("@/lib/channels/meta-cloud-alta"),
  ]);

  const token = await intercambiarCodigoMeta(code, process.env.META_APP_ID!, process.env.WHATSAPP_APP_SECRET!);
  if (!token.success) {
    return NextResponse.json(
      { error: `Meta n'a pas accepte le code (il expire en 30 secondes) : ${token.error.message ?? "sans detail"}` },
      { status: 422 }
    );
  }

  const pinConfigurado = process.env.WHATSAPP_TWO_STEP_PIN;
  const pin = modo === "nuevo" ? pinRegistro(pinConfigurado) : undefined;

  const r = await darDeAltaNumero({ phoneNumberId, accessToken: token.accessToken, wabaId, registrarConPin: pin });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // El PIN se muestra una sola vez si lo invento el CRM: Meta lo pide para volver a
  // registrar el numero y no se guarda en ningun lado.
  const pinNuevo = pin && pin !== pinConfigurado ? pin : null;
  return NextResponse.json({ ...r, pin: pinNuevo });
}
