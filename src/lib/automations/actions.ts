import "server-only";
import { db } from "@/db";
import { activities, contacts, pipelineStages, pipelines } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { notifyMember } from "@/lib/notifications";
import { resolveConversationId } from "@/lib/conversations";
import { displayName, getMember, listMembers } from "@/lib/team";
import { assignContact } from "@/lib/contacts/assign";
import { SOURCE_LABELS } from "@/lib/constants";
import type { LeadSource } from "@/types";
import type {
  AutomationEvent,
  ContactAssignedPayload,
  SelectOption,
} from "./triggers";

/**
 * Catalogo de acciones: QUE puede hacer una regla. Cada accion declara sus parametros
 * (para que el constructor dibuje el formulario) y como se ejecuta.
 *
 * Para agregar una: una entrada en `ACTIONS`. Nada mas.
 */

export type ActionKey = "push" | "add_tag" | "remove_tag" | "assign_owner" | "create_activity";

export interface ActionParam {
  key: string;
  label: string;
  type: "select" | "text" | "textarea";
  required?: boolean;
  placeholder?: string;
  /** Solo `select`. */
  options?: () => Promise<SelectOption[]>;
  /** Solo texto: acepta {{placeholders}} del disparador. */
  templated?: boolean;
}

export interface ActionSpec {
  type: ActionKey;
  params: Record<string, string>;
}

export type ActionOutcome = { status: "done" | "skipped"; detail: string };

export interface ActionContext {
  event: AutomationEvent;
  contactId: string;
  /** Reemplaza {{contacto}}, {{asesor}}, {{etapa}}... segun el disparador. */
  render: (template: string) => Promise<string>;
}

export interface ActionDef {
  key: ActionKey;
  label: string;
  description: string;
  params: ActionParam[];
  run: (ctx: ActionContext, params: Record<string, string>) => Promise<ActionOutcome>;
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

/**
 * Construye el `render` de un run: resuelve cada placeholder una sola vez, y solo si
 * alguna accion lo usa (lazy).
 */
export function buildRenderer(event: AutomationEvent, contactId: string) {
  const cache = new Map<string, Promise<string>>();

  const resolve = (name: string): Promise<string> => {
    if (!cache.has(name)) cache.set(name, compute(name));
    return cache.get(name)!;
  };

  const compute = async (name: string): Promise<string> => {
    const p = event.payload;
    switch (name) {
      case "contacto": {
        if (typeof p.contactName === "string" && p.contactName) return p.contactName;
        const [c] = await db
          .select({ name: contacts.name })
          .from(contacts)
          .where(eq(contacts.id, contactId))
          .limit(1);
        return c?.name ?? "le contact";
      }
      case "asesor": {
        const ownerId =
          typeof p.ownerId === "string"
            ? p.ownerId
            : (
                await db
                  .select({ ownerId: contacts.ownerId })
                  .from(contacts)
                  .where(eq(contacts.id, contactId))
                  .limit(1)
              )[0]?.ownerId;
        if (!ownerId) return "sans conseiller";
        const m = await getMember(ownerId);
        return m ? displayName(m) : "sans conseiller";
      }
      case "quien": {
        const by = (p as unknown as ContactAssignedPayload).assignedBy;
        if (!by) return "";
        return by.type === "agent" ? "l’agent IA" : by.name;
      }
      case "etapa":
        return typeof p.stageName === "string" ? p.stageName : "";
      case "etapa_anterior":
        return typeof p.previousStageName === "string" ? p.previousStageName : "";
      case "pipeline":
        return typeof p.pipelineName === "string" ? p.pipelineName : "";
      case "operacion":
        return typeof p.dealTitle === "string" ? p.dealTitle : "";
      case "fuente": {
        const src = typeof p.source === "string" ? p.source : "";
        return SOURCE_LABELS[src as LeadSource] ?? src;
      }
      default:
        return "";
    }
  };

  return async (template: string): Promise<string> => {
    const names = [...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
    const values = new Map<string, string>();
    for (const n of new Set(names)) values.set(n, await resolve(n));
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n: string) => values.get(n) ?? "");
  };
}

// ---------------------------------------------------------------------------
// Opciones compartidas
// ---------------------------------------------------------------------------

async function recipientOptions(): Promise<SelectOption[]> {
  const members = await listMembers({ onlyActive: true });
  return [
    { value: "owner", label: "Conseiller attribué au contact" },
    { value: "admins", label: "Tous les administrateurs" },
    ...members.map((m) => ({ value: `member:${m.id}`, label: displayName(m) })),
  ];
}

async function memberOptions(): Promise<SelectOption[]> {
  const members = await listMembers({ onlyActive: true });
  return members.map((m) => ({ value: m.id, label: displayName(m) }));
}

async function activityTypeOptions(): Promise<SelectOption[]> {
  return [
    { value: "note", label: "Note" },
    { value: "follow_up", label: "Relance" },
    { value: "call", label: "Appel" },
    { value: "meeting", label: "Rendez-vous" },
    { value: "email", label: "Email" },
  ];
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

const push: ActionDef = {
  key: "push",
  label: "Notification interne",
  description: "Notification push au téléphone d’un conseiller, des administrateurs ou du conseiller attribué.",
  params: [
    { key: "to", label: "Pour", type: "select", required: true, options: recipientOptions },
    { key: "title", label: "Titre", type: "text", required: true, templated: true, placeholder: "Nouveau lead en {{etapa}}" },
    { key: "body", label: "Texte", type: "textarea", required: true, templated: true, placeholder: "{{contacto}} est passé en {{etapa}}" },
  ],
  async run(ctx, params) {
    const recipients: string[] = [];
    if (params.to === "owner") {
      const [c] = await db
        .select({ ownerId: contacts.ownerId })
        .from(contacts)
        .where(eq(contacts.id, ctx.contactId))
        .limit(1);
      if (!c?.ownerId) return { status: "skipped", detail: "Le contact n’a pas de conseiller attribué" };
      recipients.push(c.ownerId);
    } else if (params.to === "admins") {
      const admins = (await listMembers({ onlyActive: true })).filter((m) => m.role === "admin");
      recipients.push(...admins.map((m) => m.id));
    } else if (params.to?.startsWith("member:")) {
      recipients.push(params.to.slice("member:".length));
    } else {
      return { status: "skipped", detail: "Destinataire invalide" };
    }

    const title = await ctx.render(params.title ?? "");
    const body = await ctx.render(params.body ?? "");
    // Al tocar el aviso se abre la conversacion (el hilo mas reciente del contacto):
    // el aviso es para atender al cliente. Sin hilo todavia, la ficha.
    const conversationId = await resolveConversationId(ctx.contactId);
    const url = conversationId
      ? `/conversations/${conversationId}`
      : `/contacts/${ctx.contactId}`;

    // Siempre queda la notificacion interna (campanita); el push llega si el asesor
    // activo un dispositivo. El detalle dice exactamente que paso con cada uno.
    const parts: string[] = [];
    let delivered = 0;
    for (const id of [...new Set(recipients)]) {
      const m = await getMember(id);
      if (!m || !m.active) continue;
      const out = await notifyMember({
        memberId: id,
        title,
        body,
        url,
        contactId: ctx.contactId,
        tag: `auto-${ctx.contactId}`,
      });
      delivered++;
      if ("error" in out.push) parts.push(`${displayName(m)}: en el CRM (push fallo: ${out.push.error})`);
      else if (out.push.noDevices) parts.push(`${displayName(m)}: en el CRM (sin push: no activo ningun dispositivo)`);
      else parts.push(`${displayName(m)}: en el CRM + push a ${out.push.sent} dispositivo${out.push.sent === 1 ? "" : "s"}`);
    }
    return delivered > 0
      ? { status: "done", detail: parts.join(" · ") }
      : { status: "skipped", detail: "Aucun destinataire actif" };
  },
};

const addTag: ActionDef = {
  key: "add_tag",
  label: "Ajouter une étiquette",
  description: "Ajoute une étiquette au contact (s’il ne l’a pas déjà).",
  params: [{ key: "tag", label: "Étiquette", type: "text", required: true, placeholder: "urgent" }],
  async run(ctx, params) {
    const tag = (params.tag ?? "").trim();
    if (!tag) return { status: "skipped", detail: "Étiquette vide" };
    const [c] = await db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(eq(contacts.id, ctx.contactId))
      .limit(1);
    if (!c) return { status: "skipped", detail: "Contact introuvable" };
    if (c.tags.includes(tag)) return { status: "skipped", detail: `Avait déjà « ${tag} »` };
    await db
      .update(contacts)
      .set({ tags: [...c.tags, tag], updatedAt: new Date() })
      .where(eq(contacts.id, ctx.contactId));
    return { status: "done", detail: `Etiqueta "${tag}" agregada` };
  },
};

const removeTag: ActionDef = {
  key: "remove_tag",
  label: "Retirer une étiquette",
  description: "Retire une étiquette du contact.",
  params: [{ key: "tag", label: "Étiquette", type: "text", required: true }],
  async run(ctx, params) {
    const tag = (params.tag ?? "").trim();
    if (!tag) return { status: "skipped", detail: "Étiquette vide" };
    const [c] = await db
      .select({ tags: contacts.tags })
      .from(contacts)
      .where(eq(contacts.id, ctx.contactId))
      .limit(1);
    if (!c || !c.tags.includes(tag)) return { status: "skipped", detail: `N’avait pas « ${tag} »` };
    await db
      .update(contacts)
      .set({ tags: c.tags.filter((t) => t !== tag), updatedAt: new Date() })
      .where(eq(contacts.id, ctx.contactId));
    return { status: "done", detail: `Etiqueta "${tag}" quitada` };
  },
};

const assignOwner: ActionDef = {
  key: "assign_owner",
  label: "Attribuer un conseiller",
  description: "Attribue le contact à un conseiller. Déclenche aussi « Contact attribué ».",
  params: [{ key: "memberId", label: "Conseiller", type: "select", required: true, options: memberOptions }],
  async run(ctx, params) {
    if (!params.memberId) return { status: "skipped", detail: "Aucun conseiller choisi" };
    const r = await assignContact({
      contactId: ctx.contactId,
      ownerId: params.memberId,
      by: { type: "automation" },
      depth: (ctx.event.depth ?? 0) + 1,
    });
    if (!r.ok) return { status: "skipped", detail: r.error ?? "Attribution impossible" };
    const name = r.owner ? displayName(r.owner) : "?";
    return r.unchanged
      ? { status: "skipped", detail: `Ya estaba asignado a ${name}` }
      : { status: "done", detail: `Asignado a ${name}` };
  },
};

const createActivity: ActionDef = {
  key: "create_activity",
  label: "Créer une activité",
  description: "Ajoute une note ou une relance dans l’historique du contact.",
  params: [
    { key: "type", label: "Type", type: "select", required: true, options: activityTypeOptions },
    { key: "description", label: "Description", type: "textarea", required: true, templated: true, placeholder: "Appeler {{contacto}} au sujet de {{etapa}}" },
  ],
  async run(ctx, params) {
    const description = (await ctx.render(params.description ?? "")).trim();
    if (!description) return { status: "skipped", detail: "Description vide" };
    await db.insert(activities).values({
      type: params.type || "note",
      description,
      contactId: ctx.contactId,
    });
    return { status: "done", detail: `Actividad creada: ${description.slice(0, 60)}` };
  },
};

export const ACTIONS: ActionDef[] = [push, addTag, removeTag, assignOwner, createActivity];

export function actionFor(key: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.key === key);
}

/** Normaliza lo que llega del cliente a acciones validas (tipo conocido, params string). */
export function sanitizeActions(raw: unknown): { actions: ActionSpec[]; errors: string[] } {
  const actions: ActionSpec[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { actions, errors };

  raw.forEach((item, i) => {
    if (!item || typeof item !== "object") return;
    const { type, params } = item as Record<string, unknown>;
    const def = typeof type === "string" ? actionFor(type) : undefined;
    if (!def) {
      errors.push(`Accion ${i + 1}: tipo desconocido`);
      return;
    }
    const clean: Record<string, string> = {};
    const src = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
    for (const p of def.params) {
      const v = src[p.key];
      clean[p.key] = typeof v === "string" ? v : "";
      if (p.required && !clean[p.key].trim()) {
        errors.push(`${def.label}: falta "${p.label}"`);
      }
    }
    actions.push({ type: def.key, params: clean });
  });

  return { actions, errors };
}

/** Texto corto para la lista: "Push al asesor asignado, Etiqueta \"urgente\"". */
export async function describeActions(actions: ActionSpec[]): Promise<string> {
  const parts: string[] = [];
  for (const a of actions) {
    const def = actionFor(a.type);
    if (!def) continue;
    switch (a.type) {
      case "push": {
        const to = a.params.to ?? "";
        let who = "conseiller attribué";
        if (to === "admins") who = "administrateurs";
        else if (to.startsWith("member:")) {
          const m = await getMember(to.slice(7));
          who = m ? displayName(m) : "conseiller";
        }
        parts.push(`Push a ${who}`);
        break;
      }
      case "add_tag":
        parts.push(`Étiquette « ${a.params.tag} »`);
        break;
      case "remove_tag":
        parts.push(`Retirer « ${a.params.tag} »`);
        break;
      case "assign_owner": {
        const m = a.params.memberId ? await getMember(a.params.memberId) : null;
        parts.push(`Attribuer à ${m ? displayName(m) : "conseiller"}`);
        break;
      }
      case "create_activity":
        parts.push("Créer une activité");
        break;
    }
  }
  return parts.join(" · ");
}

/** Nombre legible de una etapa, para el resumen de filtros. */
export async function stageLabel(stageId: string): Promise<string> {
  const [s] = await db
    .select({ name: pipelineStages.name, pipelineId: pipelineStages.pipelineId })
    .from(pipelineStages)
    .where(eq(pipelineStages.id, stageId))
    .limit(1);
  if (!s) return "étape";
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(pipelines);
  if (n <= 1) return s.name;
  const [p] = await db
    .select({ name: pipelines.name })
    .from(pipelines)
    .where(eq(pipelines.id, s.pipelineId))
    .limit(1);
  return p ? `${p.name} › ${s.name}` : s.name;
}
