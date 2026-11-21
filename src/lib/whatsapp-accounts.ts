/**
 * Resolucion de cuentas de WhatsApp por tenant. Reemplaza el modelo de
 * credenciales globales de env: cada numero conectado vive en `whatsapp_accounts`.
 * - Entrante (webhook): se rutea por `phone_number_id`.
 * - Saliente (envio/agente): se resuelve con que cuenta responder via el tenant.
 */
import { db } from "@/db";
import { whatsappAccounts, contacts } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

export interface WhatsappAccount {
  id: string;
  tenantId: string;
  phoneNumberId: string;
  accessToken: string | null;
  wabaId: string | null;
  displayPhone: string | null;
}

function mapRow(row: typeof whatsappAccounts.$inferSelect): WhatsappAccount {
  return {
    id: row.id,
    tenantId: row.tenantId,
    phoneNumberId: row.phoneNumberId,
    accessToken: row.accessToken,
    wabaId: row.wabaId,
    displayPhone: row.displayPhone,
  };
}

/** Routing entrante: resuelve la cuenta del CRM por el phone_number_id del webhook. */
export async function getAccountByPhoneNumberId(
  phoneNumberId: string | null | undefined
): Promise<WhatsappAccount | null> {
  if (!phoneNumberId) return null;
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    // Solo activas: un numero desconectado desde Ajustes deja de ingresar mensajes.
    .where(
      and(
        eq(whatsappAccounts.phoneNumberId, phoneNumberId),
        eq(whatsappAccounts.status, "active")
      )
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Saliente: primera cuenta activa de un tenant (Fase 1 = una cuenta por tenant). */
export async function getAccountByTenant(
  tenantId: string | null | undefined
): Promise<WhatsappAccount | null> {
  if (!tenantId) return null;
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(
      and(
        eq(whatsappAccounts.tenantId, tenantId),
        eq(whatsappAccounts.status, "active")
      )
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Saliente: resuelve la cuenta con la que responder a un contacto (via su tenant). */
export async function getAccountForContact(
  contactId: string
): Promise<WhatsappAccount | null> {
  const [contact] = await db
    .select({ tenantId: contacts.tenantId })
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);
  return getAccountByTenant(contact?.tenantId);
}

/**
 * Cuenta activa "principal" para operaciones no ligadas a un contacto (ej: ABM de
 * plantillas, que viven en el WABA). Fase 1 = single-tenant, devuelve la primera
 * cuenta activa. Fase 2: resolver por el tenant del usuario logueado.
 */
export async function getPrimaryAccount(): Promise<WhatsappAccount | null> {
  const [row] = await db
    .select()
    .from(whatsappAccounts)
    .where(eq(whatsappAccounts.status, "active"))
    .limit(1);
  return row ? mapRow(row) : null;
}

// ============================================================
// Alta y baja desde Ajustes -> Canales (antes solo scripts/connect-whatsapp-account.ts)
// ============================================================

export interface CuentaWhatsappPublica {
  id: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  status: string;
  tieneToken: boolean;
  connectedAt: Date | null;
}

/** Lo que se puede mostrar en la UI: el token NUNCA sale del servidor. */
function publica(row: typeof whatsappAccounts.$inferSelect): CuentaWhatsappPublica {
  return {
    id: row.id,
    phoneNumberId: row.phoneNumberId,
    wabaId: row.wabaId,
    displayPhone: row.displayPhone,
    status: row.status,
    tieneToken: Boolean(row.accessToken),
    connectedAt: row.connectedAt,
  };
}

export async function listarCuentasWhatsapp(): Promise<CuentaWhatsappPublica[]> {
  const rows = await db.select().from(whatsappAccounts).orderBy(whatsappAccounts.createdAt);
  return rows.map(publica);
}

export interface ConectarCuentaInput {
  tenantId: string;
  phoneNumberId: string;
  accessToken: string;
  wabaId: string | null;
  displayPhone: string | null;
}

/**
 * Alta o reconexion de un numero. Idempotente por phone_number_id, igual que el script.
 * Fase 1 = una cuenta activa por tenant: las demas del mismo tenant pasan a
 * `disconnected`, porque `getAccountByTenant` elige "la primera activa" y con dos
 * activas el agente podria contestar desde el numero viejo.
 */
export async function conectarCuentaWhatsapp(
  input: ConectarCuentaInput
): Promise<CuentaWhatsappPublica> {
  const now = new Date();
  const [row] = await db
    .insert(whatsappAccounts)
    .values({
      tenantId: input.tenantId,
      phoneNumberId: input.phoneNumberId,
      wabaId: input.wabaId,
      displayPhone: input.displayPhone,
      accessToken: input.accessToken,
      status: "active",
      connectedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: whatsappAccounts.phoneNumberId,
      set: {
        tenantId: input.tenantId,
        wabaId: input.wabaId,
        displayPhone: input.displayPhone,
        accessToken: input.accessToken,
        status: "active",
        connectedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  await db
    .update(whatsappAccounts)
    .set({ status: "disconnected", updatedAt: now })
    .where(
      and(
        eq(whatsappAccounts.tenantId, input.tenantId),
        eq(whatsappAccounts.status, "active"),
        ne(whatsappAccounts.id, row.id)
      )
    );

  return publica(row);
}

/**
 * Baja: deja la fila (los mensajes viejos la referencian por phone_number_id en el
 * historial) pero borra el token y la marca desconectada. Sin cuenta activa, el
 * webhook ignora ese numero y el envio falla con un motivo claro.
 */
export async function desconectarCuentaWhatsapp(id: string): Promise<boolean> {
  const rows = await db
    .update(whatsappAccounts)
    .set({ status: "disconnected", accessToken: null, updatedAt: new Date() })
    .where(eq(whatsappAccounts.id, id))
    .returning({ id: whatsappAccounts.id });
  return rows.length > 0;
}
