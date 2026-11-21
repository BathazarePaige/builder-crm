import "server-only";
import type OpenAI from "openai";
import { db } from "@/db";
import {
  activities,
  contacts,
  conversations,
  crmSettings,
  deals,
  pipelineStages,
  pipelines,
} from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { assignContact } from "@/lib/contacts/assign";
import { displayName, findMemberByName } from "@/lib/team";
import { setDealStage } from "@/lib/deals/stage";
import { camposContacto, getConfig } from "@/lib/config";
import { validarCamposPersonalizados } from "@/lib/config/campos";
import { toolsDeModulos } from "@/lib/modules";

/**
 * Tools del agente.
 *
 * Las del NUCLEO son genericas: sirven para cualquier negocio y actuan sobre el CRM
 * (etapa, ficha, actividades, resumen, derivacion, asignacion). Lo especifico de un
 * nicho (propiedades, visitas...) lo aportan los modulos activos (`servidor.tools`).
 *
 * Ajustes -> Agente lista todo esto y permite apagar cada una por canal.
 */

export const ENABLED_TOOLS_SETTINGS_KEY = "agent.enabled_tools";

export interface ToolContext {
  contactId: string;
  /** Solo WhatsApp. En Instagram y Messenger no hay telefono: el identificador es IGSID/PSID. */
  contactPhone: string | null;
  conversationId?: string | null;
  channel?: string;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /**
   * true = despues de este resultado el agente no sigue el loop: manda el mensaje de
   * derivacion y termina (derivar_asesor).
   */
  stop?: boolean;
}

export interface ToolAgente {
  definicion: OpenAI.Chat.Completions.ChatCompletionFunctionTool;
  /** Texto para Ajustes -> Agente IA. */
  descripcionUI: string;
  ejecutar: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

type Params = NonNullable<OpenAI.Chat.Completions.ChatCompletionFunctionTool["function"]["parameters"]>;

function definir(name: string, description: string, parameters: Params): OpenAI.Chat.Completions.ChatCompletionFunctionTool {
  return { type: "function", function: { name, description, parameters } };
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// ============================================================
// Tools genericas del nucleo
// ============================================================

async function moverEtapa(args: { etapa?: string; motivo?: string }, ctx: ToolContext): Promise<ToolResult> {
  const q = normalizar(String(args.etapa ?? ""));
  if (!q) return { ok: false, error: "étape vide" };

  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  if (!pipeline) return { ok: false, error: "Aucun pipeline configuré" };

  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.pipelineId, pipeline.id))
    .orderBy(pipelineStages.order);

  const stage =
    stages.find((s) => s.key === q || normalizar(s.name) === q) ??
    stages.find((s) => normalizar(s.name).includes(q) || (s.key ?? "").includes(q));
  if (!stage) {
    return {
      ok: false,
      error: `Étape inconnue « ${args.etapa} ». Disponibles : ${stages.map((s) => s.key ?? s.name).join(", ")}`,
    };
  }

  // Operacion abierta del contacto en este pipeline (la mas reciente).
  const [abierta] = await db
    .select({ id: deals.id, stageId: deals.stageId })
    .from(deals)
    .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
    .where(
      and(
        eq(deals.contactId, ctx.contactId),
        eq(pipelineStages.pipelineId, pipeline.id),
        eq(pipelineStages.isWon, false),
        eq(pipelineStages.isLost, false)
      )
    )
    .orderBy(desc(deals.updatedAt))
    .limit(1);

  if (abierta) {
    if (abierta.stageId === stage.id) {
      return { ok: true, data: { etapa: stage.name, sin_cambio: true, message: `Déjà en « ${stage.name} ».` } };
    }
    const r = await setDealStage({ dealId: abierta.id, stageId: stage.id });
    if (!r.ok) return { ok: false, error: r.error ?? "Impossible de changer d’étape" };
    await db.insert(activities).values({
      type: "note",
      description: `Agent IA : affaire déplacée en « ${stage.name} »${args.motivo ? `: ${args.motivo}` : ""}`,
      contactId: ctx.contactId,
    });
    return { ok: true, data: { etapa: stage.name, operacion: abierta.id, creada: false } };
  }

  const [contact] = await db.select({ name: contacts.name }).from(contacts).where(eq(contacts.id, ctx.contactId)).limit(1);
  const [nueva] = await db
    .insert(deals)
    .values({ title: contact?.name ?? "Operacion", stageId: stage.id, contactId: ctx.contactId })
    .returning({ id: deals.id });
  await setDealStage({ dealId: nueva.id, stageId: stage.id, justCreated: true });
  await db.insert(activities).values({
    type: "note",
    description: `Agent IA : affaire créée en « ${stage.name} »${args.motivo ? `: ${args.motivo}` : ""}`,
    contactId: ctx.contactId,
  });
  return { ok: true, data: { etapa: stage.name, operacion: nueva.id, creada: true } };
}

async function actualizarContacto(
  args: { nombre?: string; email?: string; telefono?: string; notas?: string; campos?: Record<string, unknown> },
  ctx: ToolContext
): Promise<ToolResult> {
  const [actual] = await db.select().from(contacts).where(eq(contacts.id, ctx.contactId)).limit(1);
  if (!actual) return { ok: false, error: "contact introuvable" };

  const set: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
  const cambios: string[] = [];

  if (typeof args.nombre === "string" && args.nombre.trim()) {
    set.name = args.nombre.trim().slice(0, 120);
    cambios.push("nombre");
  }
  if (typeof args.email === "string" && args.email.includes("@")) {
    set.email = args.email.trim().toLowerCase();
    cambios.push("email");
  }
  if (typeof args.telefono === "string" && args.telefono.trim()) {
    set.phone = args.telefono.trim();
    cambios.push("telefono");
  }
  if (typeof args.notas === "string" && args.notas.trim()) {
    const nota = `[IA] ${args.notas.trim()}`;
    set.notes = actual.notes ? `${actual.notes}\n${nota}` : nota;
    cambios.push("notas");
  }
  if (args.campos && typeof args.campos === "object") {
    const v = validarCamposPersonalizados(camposContacto(), args.campos, { parcial: true });
    if (!v.ok) return { ok: false, error: v.error };
    set.customFields = { ...((actual.customFields as Record<string, unknown> | null) ?? {}), ...v.valores };
    cambios.push(...Object.keys(v.valores));
  }

  if (cambios.length === 0) return { ok: false, error: "rien à mettre à jour" };
  await db.update(contacts).set(set).where(eq(contacts.id, ctx.contactId));
  return { ok: true, data: { actualizado: cambios } };
}

const TIPOS_ACTIVIDAD: Record<string, string> = {
  nota: "note",
  tarea: "follow_up",
  seguimiento: "follow_up",
  llamada: "call",
  reunion: "meeting",
  email: "email",
};

async function registrarActividad(
  args: { tipo?: string; descripcion?: string; fecha?: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const descripcion = String(args.descripcion ?? "").trim();
  if (!descripcion) return { ok: false, error: "description vide" };
  const tipo = TIPOS_ACTIVIDAD[normalizar(String(args.tipo ?? "nota"))] ?? "note";
  let scheduledAt: Date | null = null;
  if (args.fecha) {
    const d = new Date(String(args.fecha));
    if (!Number.isNaN(d.getTime())) scheduledAt = d;
  }
  const [row] = await db
    .insert(activities)
    .values({ type: tipo, description: `[IA] ${descripcion}`, contactId: ctx.contactId, scheduledAt })
    .returning({ id: activities.id });
  return { ok: true, data: { actividad: row.id, tipo, programada: scheduledAt?.toISOString() ?? null } };
}

async function resumenLead(
  args: { resumen?: string; campos?: Record<string, unknown> },
  ctx: ToolContext
): Promise<ToolResult> {
  const resumen = String(args.resumen ?? "").trim();
  if (!resumen) return { ok: false, error: "résumé vide" };

  const set: Partial<typeof contacts.$inferInsert> = {
    aiSummary: resumen.slice(0, 2000),
    aiSummaryAt: new Date(),
    updatedAt: new Date(),
  };
  if (args.campos && typeof args.campos === "object") {
    const v = validarCamposPersonalizados(camposContacto(), args.campos, { parcial: true });
    if (!v.ok) return { ok: false, error: v.error };
    const [actual] = await db.select({ cf: contacts.customFields }).from(contacts).where(eq(contacts.id, ctx.contactId)).limit(1);
    set.customFields = { ...((actual?.cf as Record<string, unknown> | null) ?? {}), ...v.valores };
  }
  await db.update(contacts).set(set).where(eq(contacts.id, ctx.contactId));
  await db.insert(activities).values({
    type: "note",
    description: `Résumé de l’agent IA : ${resumen.slice(0, 500)}`,
    contactId: ctx.contactId,
  });
  return { ok: true, data: { guardado: true } };
}

async function derivarAsesor(args: { motivo?: string }, ctx: ToolContext): Promise<ToolResult> {
  const motivo = String(args.motivo ?? "transmis par l’agent").slice(0, 300);
  const now = new Date();

  // Se apaga el agente en ESTA conversacion, no en el contacto entero: derivar una
  // consulta que entro por Instagram no deberia callar al agente en WhatsApp. El
  // kill-switch global del contacto sigue existiendo desde la ficha.
  if (ctx.conversationId) {
    await db
      .update(conversations)
      .set({ aiEnabled: false, needsHuman: true, needsHumanReason: motivo, needsHumanAt: now, updatedAt: now })
      .where(eq(conversations.id, ctx.conversationId));
  } else {
    await db
      .update(contacts)
      .set({ aiEnabled: false, needsHuman: true, needsHumanReason: motivo, needsHumanAt: now, updatedAt: now })
      .where(eq(contacts.id, ctx.contactId));
  }

  await db.insert(activities).values({
    type: "note",
    description: `Agent IA : transmis à un humain. Motif : ${motivo}`,
    contactId: ctx.contactId,
  });

  return {
    ok: true,
    stop: true,
    data: { derivado: true, motivo, message: "Agent en pause dans cette conversation. Une personne de l’équipe prend le relais." },
  };
}

async function asignarAsesor(args: { asesor?: string; motivo?: string }, ctx: ToolContext): Promise<ToolResult> {
  const found = await findMemberByName(String(args.asesor ?? ""));

  if (found.status === "ambiguous") {
    return {
      ok: false,
      error:
        `Plusieurs personnes correspondent à « ${args.asesor} » : ` +
        found.candidates.map(displayName).join(", ") +
        ". Précisez laquelle.",
    };
  }
  if (found.status === "not_found") {
    return {
      ok: false,
      error: `« ${args.asesor} » n’existe pas. Disponibles : ` + (found.available.map(displayName).join(", ") || "aucun"),
    };
  }

  const result = await assignContact({
    contactId: ctx.contactId,
    ownerId: found.member.id,
    by: { type: "agent" },
    reason: args.motivo,
  });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    data: {
      asignado_a: displayName(found.member),
      ya_estaba_asignado: result.unchanged ?? false,
      message: result.unchanged
        ? `Le contact était déjà attribué à ${displayName(found.member)}.`
        : `Contact attribué à ${displayName(found.member)}. Une notification lui a été envoyée.`,
    },
  };
}

function toolsGenericas(): ToolAgente[] {
  const campos = camposContacto();
  const etiquetaAsesor = getConfig().roles.etiquetaAsesor.toLowerCase();
  const descripcionCampos =
    campos.length > 0
      ? "Clés disponibles : " +
        campos
          .map((c) => `${c.clave} (${c.tipo}${c.opciones ? ": " + c.opciones.join("|") : ""})`)
          .join("; ")
      : "Aucun champ personnalisé configuré.";

  return [
    {
      definicion: definir(
        "mover_etapa",
        "Déplace l’affaire du contact vers une étape du pipeline (ou la crée à cette étape s’il n’en a pas d’ouverte). " +
          "À utiliser quand le client avance ou recule dans le processus ; les étapes disponibles sont dans la section PIPELINE du contexte.",
        {
          type: "object",
          properties: {
            etapa: { type: "string", description: "Clé ou nom de l’étape, tel qu’il figure dans PIPELINE." },
            motivo: { type: "string", description: "Pourquoi l’affaire change d’étape, en quelques mots." },
          },
          required: ["etapa"],
          additionalProperties: false,
        }
      ),
      descripcionUI: "Déplace (ou crée) l’affaire du contact dans le pipeline. Le prompt décide quelle étape utiliser à chaque moment.",
      ejecutar: (a, ctx) => moverEtapa(a as { etapa?: string; motivo?: string }, ctx),
    },
    {
      definicion: definir(
        "actualizar_contacto",
        "Enregistre dans la fiche du contact les informations que tu obtiens : nom, e-mail, téléphone, notes et champs personnalisés de l’entreprise. " +
          descripcionCampos,
        {
          type: "object",
          properties: {
            nombre: { type: "string" },
            email: { type: "string" },
            telefono: { type: "string" },
            notas: { type: "string", description: "Remarque brève pour l’équipe." },
            campos: {
              type: "object",
              description: "Paires clé : valeur des champs personnalisés. " + descripcionCampos,
              additionalProperties: true,
            },
          },
          additionalProperties: false,
        }
      ),
      descripcionUI: "Met à jour la fiche du contact (informations de base et champs personnalisés de config/cliente.ts).",
      ejecutar: (a, ctx) => actualizarContacto(a as Parameters<typeof actualizarContacto>[0], ctx),
    },
    {
      definicion: definir(
        "registrar_actividad",
        "Ajoute une activité dans la fiche pour l’équipe : une note, ou une tâche/relance datée (par exemple « appeler lundi »).",
        {
          type: "object",
          properties: {
            tipo: { type: "string", enum: ["nota", "tarea", "llamada", "reunion", "email"] },
            descripcion: { type: "string" },
            fecha: { type: "string", description: "ISO 8601 s’il s’agit d’une tâche datée (facultatif)." },
          },
          required: ["descripcion"],
          additionalProperties: false,
        }
      ),
      descripcionUI: "Enregistre des notes et des tâches datées dans la fiche du contact.",
      ejecutar: (a, ctx) => registrarActividad(a as Parameters<typeof registrarActividad>[0], ctx),
    },
    {
      definicion: definir(
        "resumen_lead",
        "Laisse dans la fiche un résumé de 2 à 4 phrases : ce que cherche le client, sa situation et les prochaines étapes. " +
          "À utiliser quand la conversation a atteint un point utile ou que le client a pris congé. Peut inclure des champs personnalisés.",
        {
          type: "object",
          properties: {
            resumen: { type: "string" },
            campos: { type: "object", description: "Champs personnalisés confirmés. " + descripcionCampos, additionalProperties: true },
          },
          required: ["resumen"],
          additionalProperties: false,
        }
      ),
      descripcionUI: "Écrit le résumé du lead dans la fiche (visible dans les contacts et dans la conversation).",
      ejecutar: (a, ctx) => resumenLead(a as Parameters<typeof resumenLead>[0], ctx),
    },
    {
      definicion: definir(
        "derivar_asesor",
        "Transmet la conversation à une personne de l’équipe et MET EN PAUSE l’agent dans ce fil. " +
          "À utiliser quand la demande dépasse ce que tu sais, qu’un outil échoue ou que le client demande à parler à quelqu’un.",
        {
          type: "object",
          properties: { motivo: { type: "string", description: "Raison courte du transfert." } },
          required: ["motivo"],
          additionalProperties: false,
        }
      ),
      descripcionUI: "Permet à l’agent de transmettre à un humain (met l’agent en pause dans cette conversation seulement). Recommandé de la laisser active.",
      ejecutar: (a, ctx) => derivarAsesor(a as { motivo?: string }, ctx),
    },
    {
      definicion: definir(
        "asignar_asesor",
        `Attribue ce contact à un ${etiquetaAsesor} de l’équipe, qui reçoit une notification. Ne met PAS l’agent en pause. ` +
          "Les personnes disponibles sont dans la section ÉQUIPE du contexte ; utilise le nom tel qu’il apparaît.",
        {
          type: "object",
          properties: {
            asesor: { type: "string", description: "Nom (ou e-mail) tel qu’il figure dans ÉQUIPE." },
            motivo: { type: "string" },
          },
          required: ["asesor"],
          additionalProperties: false,
        }
      ),
      descripcionUI: `Permet à l’agent d’attribuer le contact à un ${etiquetaAsesor} par son nom. Déclenche l’automatisation de notification.`,
      ejecutar: (a, ctx) => asignarAsesor(a as { asesor?: string; motivo?: string }, ctx),
    },
  ];
}

// ============================================================
// Registro
// ============================================================

/** Todas las tools disponibles en esta instancia: nucleo + nicho + modulos activos. */
export function listarTools(): ToolAgente[] {
  return [...toolsGenericas(), ...toolsDeModulos()];
}

export function nombresDeTools(): string[] {
  return listarTools().map((t) => t.definicion.function.name);
}

export function descripcionesUI(): Array<{ name: string; description: string }> {
  return listarTools().map((t) => ({ name: t.definicion.function.name, description: t.descripcionUI }));
}

export function esNombreDeTool(name: string): boolean {
  return nombresDeTools().includes(name);
}

export async function executeTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const tool = listarTools().find((t) => t.definicion.function.name === name);
  if (!tool) return { ok: false, error: `Outil inconnu : ${name}` };
  const argumentos = args && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  try {
    return await tool.ejecutar(argumentos, ctx);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erreur lors de l’exécution de l’outil" };
  }
}

/**
 * Tools habilitadas globalmente (`crm_settings`). Sin fila = todas. Los nombres que ya
 * no existen (modulo apagado, tool renombrada) se descartan.
 */
export async function getEnabledToolNames(): Promise<string[]> {
  const todas = nombresDeTools();
  try {
    const [row] = await db.select().from(crmSettings).where(eq(crmSettings.key, ENABLED_TOOLS_SETTINGS_KEY)).limit(1);
    if (!row) return todas;
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return todas;
    const set = new Set(todas);
    return parsed.filter((n): n is string => typeof n === "string" && set.has(n));
  } catch (err) {
    console.error("[tools] error leyendo enabled_tools, usando default", err);
    return todas;
  }
}

/** Definiciones para el LLM, filtradas a las habilitadas. */
export async function getEnabledToolDefinitions(names?: string[]): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
  const enabled = new Set(names ?? (await getEnabledToolNames()));
  return listarTools()
    .filter((t) => enabled.has(t.definicion.function.name))
    .map((t) => t.definicion);
}
