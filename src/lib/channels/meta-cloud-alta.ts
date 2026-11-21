import "server-only";
import { obtenerNumeroMeta, registrarNumeroMeta, suscribirAppAWaba } from "@/lib/meta-whatsapp";
import { conectarCuentaWhatsapp, type CuentaWhatsappPublica } from "@/lib/whatsapp-accounts";
import { resolveDefaultTenantId } from "@/lib/tenants";
import { whatsappProvider } from "./provider";
import { webhookPropioInstancia } from "./meta-cloud-conexion";

/**
 * Alta de un numero por Meta Cloud API, compartida por los dos caminos de Ajustes: la
 * ventana de Meta (Embedded Signup) y la carga manual del token. Valida contra Graph
 * ANTES de guardar: un token o un id equivocados fallan aca y no el dia que el agente
 * intenta contestar.
 */
export interface AltaNumeroInput {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string | null;
  /** Solo numeros nuevos: registrar en Cloud API con este PIN. */
  registrarConPin?: string;
}

export type AltaNumeroResultado =
  | { ok: true; cuenta: CuentaWhatsappPublica; nombre: string | null; avisos: string[] }
  | { ok: false; status: number; error: string };

export async function darDeAltaNumero(input: AltaNumeroInput): Promise<AltaNumeroResultado> {
  const { phoneNumberId, accessToken, wabaId } = input;

  const numero = await obtenerNumeroMeta(phoneNumberId, accessToken);
  if (!numero.success) {
    return { ok: false, status: 422, error: `Meta a refuse le jeton ou l'identifiant : ${numero.error.message ?? "sans detail"}` };
  }

  const avisos: string[] = [];

  if (input.registrarConPin) {
    const reg = await registrarNumeroMeta(phoneNumberId, accessToken, input.registrarConPin);
    if (!reg.success) {
      avisos.push(
        `Meta n'a pas pu enregistrer le numero (${reg.error?.message ?? "sans detail"}). Il recevra mais n'enverra pas tant qu'il n'est pas enregistre.`
      );
    }
  }

  if (wabaId) {
    const webhook = webhookPropioInstancia(
      process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL,
      process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    );
    const sub = await suscribirAppAWaba(wabaId, accessToken, webhook);
    if (sub.success && !webhook) {
      avisos.push(
        "APP_BASE_URL (en https) ou WHATSAPP_WEBHOOK_VERIFY_TOKEN manque : les messages de ce numero iront a l'URL de webhook de l'app Meta, pas forcement a cette instance."
      );
    }
    if (!sub.success) {
      avisos.push(
        `Impossible d'abonner l'application au compte WhatsApp Business (${sub.error?.message ?? "sans detail"}) : le numero enverra mais ne recevra rien tant que ce n'est pas fait.`
      );
    }
  } else {
    avisos.push("Sans identifiant WABA, l'application n'est pas abonnee : fais-le depuis Meta ou reconnecte avec le WABA.");
  }

  const tenantId = await resolveDefaultTenantId();
  if (!tenantId) return { ok: false, status: 500, error: "Le tenant par defaut n'existe pas : migrations manquantes" };

  const cuenta = await conectarCuentaWhatsapp({
    tenantId,
    phoneNumberId,
    accessToken,
    wabaId,
    displayPhone: numero.numero.displayPhone,
  });

  if (whatsappProvider() !== "meta") {
    avisos.push("Le numero est enregistre, mais WhatsApp passe encore par Zernio tant que l'instance n'a pas WHATSAPP_PROVIDER=meta.");
  }

  return { ok: true, cuenta, nombre: numero.numero.verifiedName, avisos };
}
