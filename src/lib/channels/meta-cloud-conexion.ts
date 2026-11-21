import { z } from "zod";

/**
 * Lo que pega el administrador en Ajustes -> Canales para conectar un numero por Meta
 * Cloud API directo. Puro (sin base ni red) para que lo cubran los tests y lo use igual
 * el formulario y la ruta.
 *
 * Los ids de Meta son numericos; se aceptan con espacios alrededor porque se copian del
 * panel de Meta. El token es largo y opaco: solo se exige que no este vacio ni tenga
 * espacios adentro (el error tipico es pegar "Bearer xxx" o dos tokens juntos).
 */
const idMeta = z
  .string()
  .trim()
  .regex(/^\d{5,25}$/, "Doit etre l'identifiant numerique affiche par Meta");

export const conexionMetaSchema = z.object({
  phoneNumberId: idMeta,
  wabaId: z.union([idMeta, z.literal("")]).optional(),
  accessToken: z
    .string()
    .trim()
    .transform((t) => t.replace(/^Bearer\s+/i, ""))
    .pipe(
      z
        .string()
        .min(20, "Le jeton semble incomplet")
        .regex(/^\S+$/, "Le jeton ne peut pas contenir d'espaces")
    ),
});

export type ConexionMeta = z.infer<typeof conexionMetaSchema>;

/** URL que hay que registrar como callback en la app de Meta. */
export function urlWebhookMeta(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/whatsapp`;
}
