import { db } from "@/db";
import { contacts, crmSettings, deals, pipelineStages, pipelines } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { camposContacto, getConfig, localeIntl } from "@/lib/config";
import { resumirCampos } from "@/lib/config/campos";

export const SYSTEM_PROMPT_SETTINGS_KEY = "agent.system_prompt";

/**
 * Prompt base del nucleo: generico, sirve para cualquier negocio. Lo que es propio de
 * un cliente va en `config/cliente.ts` (`agente.prompt`, que lo reemplaza como base) o
 * en una plantilla de nicho. Cascada completa:
 *
 *   agent_configs[canal] -> crm_settings global -> config.agente.prompt -> este default
 *
 * Placeholders: {{agente}}, {{negocio}}, {{fecha}}, {{canal}}. Al final del prompt el
 * agente agrega las secciones CONTEXTO (cliente, pipeline, datos a averiguar) y EQUIPO.
 */
const DEFAULT_SYSTEM_PROMPT = `# RÔLE
Tu es {{agente}}, membre de l’équipe de {{negocio}}. Tu réponds aux personnes qui écrivent par {{canal}} : tu réponds à leurs questions, tu obtiens ce que l’équipe a besoin de savoir sur chacune et tu l’enregistres dans le CRM.

# COMMENT TU TRAVAILLES
- Tu réponds dans la langue du client, de façon brève et naturelle (1 à 3 courts paragraphes).
- Tu ne dis pas que tu es une IA et tu ne parles pas des outils internes.
- Quand le client donne une information utile (son nom, ce qu’il cherche, son budget, ses délais…), tu l’enregistres avec actualizar_contacto avant de répondre. La section INFORMATIONS À OBTENIR dit quoi demander ; demande une chose à la fois, au moment naturel, sans interroger.
- Quand le client avance (montre de l’intérêt, demande une proposition, veut parler à quelqu’un) ou se refroidit, tu déplaces l’affaire avec mover_etapa vers l’étape qui convient selon PIPELINE.
- Si tu dois noter quelque chose pour l’équipe (rappeler demain, envoyer une proposition), tu utilises registrar_actividad.
- Quand la conversation atteint un point utile (tu sais ce que cherche le client, ou il a pris congé), tu laisses un resumen_lead de 2 à 4 phrases avec l’essentiel.
- Si tu ne sais pas quelque chose, si le client demande à parler à une personne ou si un outil échoue, tu utilises derivar_asesor et tu réponds calmement qu’une personne de l’équipe prend le relais.
- N’invente jamais de prix, de disponibilités ni de conditions : s’ils ne sont pas dans le contexte ou dans un outil, tu transmets.

# IMPORTANT
- La date du jour est {{fecha}}.
- Tes réponses sont envoyées directement au client par {{canal}}.
- Après avoir utilisé un outil, tu intègres l’information dans ta réponse naturelle ; tu ne copies jamais le JSON.`;

/**
 * Guia de estilo segun por donde entra el mensaje. Un DM de Instagram no se escribe
 * como un WhatsApp. Es el piso comun; el prompt propio de cada canal lo puede pisar.
 */
const CHANNEL_HINTS: Record<string, string> = {
  whatsapp: "Garde chaque réponse courte et naturelle (1 à 3 courts paragraphes). Tu peux inclure des liens s’ils sont utiles.",
  instagram:
    "Tu es dans un message privé Instagram : réponds en 1 ou 2 phrases, sur un ton informel et direct. Évite de coller de longues URL ; si des détails sont nécessaires, propose de continuer sur WhatsApp et demande le numéro.",
  facebook: "Tu es sur Messenger : réponses brèves (1 ou 2 phrases) et ton chaleureux. Tu peux inclure un lien s’il est utile.",
};

const CHANNEL_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
  simulador: "le simulateur",
};

/** Prompt base de la instancia: el de config/cliente.ts si existe, si no el del nucleo. */
export function getDefaultSystemPromptTemplate(): string {
  return getConfig().agente.prompt?.trim() || DEFAULT_SYSTEM_PROMPT;
}

/**
 * Template global (override en `crm_settings`, editable desde Ajustes) SIN reemplazar
 * placeholders. Cae al default de la instancia.
 */
export async function getSystemPromptTemplate(): Promise<string> {
  try {
    const [row] = await db.select().from(crmSettings).where(eq(crmSettings.key, SYSTEM_PROMPT_SETTINGS_KEY)).limit(1);
    const stored = row?.value?.trim();
    if (stored) return stored;
  } catch (err) {
    console.error("[prompt] error leyendo override, usando default", err);
  }
  return getDefaultSystemPromptTemplate();
}

export const getGlobalSystemPromptTemplate = getSystemPromptTemplate;

/** Reemplaza placeholders y agrega la guia del canal. */
export function renderSystemPrompt(template: string, opts: { now?: Date; channel?: string } = {}): string {
  const now = opts.now ?? new Date();
  const channel = opts.channel ?? "whatsapp";
  const { marca, agente, zonaHoraria } = getConfig();

  // La zona es la del negocio, no la del proceso: el contenedor corre en UTC, y sin esto
  // el agente le dice "manana" al cliente que escribe de noche.
  const fecha = now.toLocaleDateString(localeIntl(), {
    timeZone: zonaHoraria,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const rendered = template
    .replaceAll("{{fecha}}", fecha)
    .replaceAll("{{canal}}", CHANNEL_NAMES[channel] ?? channel)
    .replaceAll("{{agente}}", agente.nombre)
    .replaceAll("{{negocio}}", marca.nombre);

  const hint = CHANNEL_HINTS[channel];
  return hint ? `${rendered}\n\n# CANAL\n${hint}` : rendered;
}

/**
 * Seccion CONTEXTO: lo que el agente sabe del cliente, en que etapa esta, que etapas
 * existen y que datos tiene que averiguar. Es lo que hace utiles a mover_etapa y
 * actualizar_contacto sin cablear nada del negocio en el codigo.
 */
export async function renderContexto(contactId: string): Promise<string> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!contact) return "";

  const campos = camposContacto();
  const conocidos = resumirCampos(campos, contact.customFields as Record<string, never> | null);
  const aAveriguar = campos
    .filter((c) => c.agente?.calificar !== false && c.agente)
    .filter((c) => {
      const v = (contact.customFields as Record<string, unknown> | null)?.[c.clave];
      return v === null || v === undefined || v === "";
    })
    .map((c) => `- ${c.etiqueta} (${c.clave}${c.opciones ? " : " + c.opciones.join(" | ") : ""}) : ${c.agente?.descripcion ?? "demander naturellement"}`);

  const [pipeline] = await db.select().from(pipelines).where(eq(pipelines.isDefault, true)).limit(1);
  let etapasTxt = "";
  let etapaActual = "aucune affaire ouverte";
  if (pipeline) {
    const stages = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.pipelineId, pipeline.id))
      .orderBy(pipelineStages.order);
    etapasTxt = stages.map((s) => `- ${s.key ?? s.name}: ${s.name}${s.isWon ? " (gagnée)" : s.isLost ? " (perdue)" : ""}`).join("\n");
    const [abierta] = await db
      .select({ name: pipelineStages.name })
      .from(deals)
      .innerJoin(pipelineStages, eq(deals.stageId, pipelineStages.id))
      .where(and(eq(deals.contactId, contactId), eq(pipelineStages.pipelineId, pipeline.id)))
      .orderBy(desc(deals.updatedAt))
      .limit(1);
    if (abierta) etapaActual = abierta.name;
  }

  const partes = [
    "\n\n# CONTEXTE",
    "## Client",
    `- Nom : ${contact.name}${contact.email ? `\n- E-mail : ${contact.email}` : ""}${contact.phone ? `\n- Téléphone : ${contact.phone}` : ""}`,
    ...(conocidos.length ? [`- Informations connues : ${conocidos.join(" ; ")}`] : []),
    ...(contact.aiSummary ? [`- Résumé précédent : ${contact.aiSummary}`] : []),
    `- Étape actuelle : ${etapaActual}`,
  ];
  if (etapasTxt) partes.push("## Pipeline (clé : nom)", etapasTxt);
  if (aAveriguar.length) partes.push("## Informations à obtenir", ...aAveriguar);
  return partes.join("\n");
}

/** Prompt final con el template global (sin contexto de contacto). Para previews. */
export async function buildSystemPrompt(now: Date, channel = "whatsapp"): Promise<string> {
  const template = await getSystemPromptTemplate();
  return renderSystemPrompt(template, { now, channel });
}
