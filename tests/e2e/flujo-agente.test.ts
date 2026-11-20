import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";

/**
 * EL FLUJO COMPLETO DEL AGENTE, de punta a punta y sin red.
 *
 *   Zernio -> POST /api/webhooks/zernio (firma, claim en webhook_events, after())
 *     -> ingesta (contacto, conversacion, mensaje, job del agente)
 *     -> debounce -> POST /api/agent/process (con AGENT_WORKER_SECRET)
 *     -> agente: OpenRouter pide mover_etapa -> operacion en "Calificado"
 *     -> OpenRouter contesta -> deliverMessage -> Zernio envia la respuesta
 *
 * Los tests de tests/*.test.ts cuidan cada pieza por separado; este cuida las uniones,
 * que es donde se rompe sin avisar: un job que nadie dispara, un worker que responde 401
 * porque cambio el nombre de una cabecera, una respuesta que se guarda pero no sale.
 * Todas esas fallas dejan la bandeja "normal" y al cliente sin respuesta.
 *
 * Lo real: las dos rutas de API, el conector de Zernio, la ingesta, la cola, el agente,
 * las tools y la base (Postgres embebido en memoria con las migraciones de verdad).
 * Lo falso: solo la red. `fetch` se reemplaza y contesta por Zernio y por OpenRouter; una
 * llamada a cualquier otro host hace fallar el test, asi que una dependencia de red
 * nueva en este camino no pasa desapercibida. `after()` se junta en una lista porque
 * fuera de Next no hay request que lo ejecute, y el reloj se adelanta para no esperar
 * los 6 s de debounce de verdad (ver `sinEsperarDebounce`).
 */

const estado = vi.hoisted(() => ({
  pendientesAfter: [] as Array<() => unknown>,
}));

vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return {
    ...real,
    after: (tarea: (() => unknown) | Promise<unknown>) => {
      estado.pendientesAfter.push(typeof tarea === "function" ? tarea : () => tarea);
    },
  };
});

vi.mock("@/db", async () => {
  const { crearBaseEmbebida } = await import("./base-embebida");
  const { db } = await crearBaseEmbebida();
  return { db };
});

const APP = "http://crm.prueba";
const ZERNIO_API = "https://zernio.prueba/api/v1";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const SECRETO_WEBHOOK = "secreto-webhook-de-prueba";
const SECRETO_WORKER = "secreto-worker-de-prueba";

const CUENTA_ZERNIO = "zacc_whatsapp_prueba";
const CONVERSACION_ZERNIO = "zconv_prueba_1";
const TEXTO_ENTRANTE = "Hola! Quiero comprar 20 licencias para mi equipo este mes, presupuesto 2000 USD.";
const RESPUESTA_AGENTE = "Genial, Ana! Te paso la propuesta para 20 licencias hoy mismo.";

// ---------------------------------------------------------------------------
// La red falsa
// ---------------------------------------------------------------------------

interface LlamadaRegistrada {
  url: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown>;
}

const llamadas = {
  openrouter: [] as LlamadaRegistrada[],
  zernio: [] as LlamadaRegistrada[],
  worker: [] as Array<{ status: number; body: Record<string, unknown> }>,
};

/** Lo que contesta OpenRouter, en orden: primero pide una tool, despues responde. */
const guionOpenRouter = [
  {
    finish_reason: "tool_calls",
    message: {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_mover_1",
          type: "function",
          function: {
            name: "mover_etapa",
            arguments: JSON.stringify({ etapa: "calificado", motivo: "20 licencias, presupuesto definido" }),
          },
        },
      ],
    },
  },
  {
    finish_reason: "stop",
    message: { role: "assistant", content: RESPUESTA_AGENTE },
  },
];

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function leerLlamada(entrada: RequestInfo | URL, init?: RequestInit): Promise<LlamadaRegistrada> {
  const req = new Request(entrada, init);
  const texto = await req.text();
  return {
    url: req.url,
    method: req.method,
    headers: req.headers,
    body: texto ? (JSON.parse(texto) as Record<string, unknown>) : {},
  };
}

async function fetchFalso(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = entrada instanceof Request ? entrada.url : String(entrada);

  if (url.startsWith(OPENROUTER)) {
    llamadas.openrouter.push(await leerLlamada(entrada, init));
    const paso = guionOpenRouter[llamadas.openrouter.length - 1];
    if (!paso) return json({ error: { message: "el guion de OpenRouter se termino" } }, 500);
    return json({
      id: `gen-${llamadas.openrouter.length}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "modelo/de-prueba",
      choices: [{ index: 0, ...paso }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }

  if (url.startsWith(ZERNIO_API)) {
    llamadas.zernio.push(await leerLlamada(entrada, init));
    return json({ success: true, data: { messageId: `wamid.salida-${llamadas.zernio.length}` } });
  }

  if (url === `${APP}/api/agent/process`) {
    // El webhook se llama a si mismo para despertar al worker: aca se entrega a la ruta
    // de verdad, con las cabeceras tal como las armo `triggerAgentWorker`.
    const { POST } = await import("@/app/api/agent/process/route");
    const res = await POST(new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]));
    llamadas.worker.push({ status: res.status, body: await res.clone().json() });
    return res;
  }

  throw new Error(`fetch inesperado en el flujo del agente: ${url}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function payloadEntrante(id: string) {
  const ahora = new Date().toISOString();
  return {
    id,
    event: "message.received",
    timestamp: ahora,
    account: { accountId: CUENTA_ZERNIO, platform: "whatsapp" },
    conversation: {
      id: CONVERSACION_ZERNIO,
      participantId: "5491155550000",
      participantName: "Ana Prueba",
    },
    message: {
      id: `zmsg_${id}`,
      conversationId: CONVERSACION_ZERNIO,
      platform: "whatsapp",
      platformMessageId: `wamid.entrada-${id}`,
      direction: "incoming",
      text: TEXTO_ENTRANTE,
      sender: { id: "5491155550000", phone: "5491155550000", name: "Ana Prueba" },
      sentAt: ahora,
    },
  };
}

async function postWebhook(payload: unknown, firma?: string) {
  const cuerpo = JSON.stringify(payload);
  const { POST } = await import("@/app/api/webhooks/zernio/route");
  return POST(
    new NextRequest(`${APP}/api/webhooks/zernio`, {
      method: "POST",
      body: cuerpo,
      headers: {
        "content-type": "application/json",
        "x-zernio-signature":
          firma ?? crypto.createHmac("sha256", SECRETO_WEBHOOK).update(cuerpo).digest("hex"),
      },
    })
  );
}

/**
 * Corre lo que la ruta dejo en `after()` (y lo que esas tareas encolen a su vez), como
 * haria Next al terminar la respuesta.
 */
async function correrAfter() {
  while (estado.pendientesAfter.length > 0) {
    const tareas = estado.pendientesAfter.splice(0);
    await Promise.all(tareas.map((t) => Promise.resolve().then(t)));
  }
}

/**
 * El debounce del agente sin esperarlo: `triggerAgentWorker` duerme 6 s antes de llamar
 * al worker, y el worker compara `process_after` con el reloj. Se congela `Date`, y cada
 * setTimeout de al menos el debounce adelanta ese reloj lo que pedia y dispara enseguida.
 *
 * No se usan los timers falsos de vitest (`toFake: ["setTimeout"]`) a proposito: con
 * ellos las consultas al Postgres embebido no terminan nunca y el test se cuelga.
 */
async function sinEsperarDebounce<T>(fn: () => Promise<T>): Promise<T> {
  const { queueConfig } = await import("@/lib/agent/queue");
  const setTimeoutReal = globalThis.setTimeout;
  vi.useFakeTimers({ toFake: ["Date"] });
  const espia = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    tarea: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) => {
    if (typeof ms === "number" && ms >= queueConfig.debounceMs) {
      vi.setSystemTime(Date.now() + ms);
      return setTimeoutReal(tarea, 0, ...args);
    }
    return setTimeoutReal(tarea, ms, ...args);
  }) as typeof setTimeout);
  try {
    return await fn();
  } finally {
    espia.mockRestore();
    vi.useRealTimers();
  }
}

// ---------------------------------------------------------------------------

describe("flujo del agente de punta a punta (Zernio y OpenRouter simulados)", () => {
  beforeAll(async () => {
    vi.stubEnv("ZERNIO_WEBHOOK_SECRET", SECRETO_WEBHOOK);
    vi.stubEnv("ZERNIO_API_KEY", "clave-zernio-de-prueba");
    vi.stubEnv("ZERNIO_API_BASE", ZERNIO_API);
    vi.stubEnv("OPENROUTER_API_KEY", "clave-openrouter-de-prueba");
    vi.stubEnv("AGENT_MODEL", "modelo/de-prueba");
    vi.stubEnv("AGENT_WORKER_SECRET", SECRETO_WORKER);
    vi.stubEnv("APP_BASE_URL", APP);
    vi.stubGlobal("fetch", fetchFalso);

    // Lo que una instancia tiene antes del primer mensaje: el pipeline de la config
    // (lo sincroniza instrumentation.ts al arrancar) y la cuenta de WhatsApp conectada.
    const { db } = await import("@/db");
    const { channelAccounts, tenants } = await import("@/db/schema");
    const { sincronizarPipeline } = await import("@/lib/pipeline/sincronizar");
    await sincronizarPipeline();

    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "default")).limit(1);
    await db.insert(channelAccounts).values({
      tenantId: tenant.id,
      provider: "zernio",
      platform: "whatsapp",
      zernioAccountId: CUENTA_ZERNIO,
      displayName: "WhatsApp de prueba",
      status: "active",
    });
  }, 60_000);

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rechaza un webhook con firma falsa sin tocar la base", async () => {
    const res = await postWebhook(payloadEntrante("evt_falso"), "0".repeat(64));
    expect(res.status).toBe(401);
    expect(estado.pendientesAfter).toHaveLength(0);
  });

  it("mensaje entrante -> el agente mueve la etapa y contesta por Zernio", async () => {
    const { db } = await import("@/db");
    const s = await import("@/db/schema");

    // 1. Zernio entrega el mensaje: 2xx inmediato, el trabajo queda para after().
    const res = await postWebhook(payloadEntrante("evt_1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(estado.pendientesAfter.length).toBeGreaterThan(0);
    expect(llamadas.openrouter).toHaveLength(0);

    // 2. Ingesta, debounce, worker y agente.
    await sinEsperarDebounce(correrAfter);

    // El worker se desperto con el secreto y termino bien.
    expect(llamadas.worker).toHaveLength(1);
    expect(llamadas.worker[0].status).toBe(200);
    expect(llamadas.worker[0].body).toMatchObject({ ok: true, reply: RESPUESTA_AGENTE, toolCalls: 1 });

    // 3. Lo que vio el modelo: el mensaje del cliente, el CONTEXTO con el pipeline y la
    //    tool para moverlo. Y en la segunda vuelta, el resultado de la tool.
    expect(llamadas.openrouter).toHaveLength(2);
    const [primera, segunda] = llamadas.openrouter;
    expect(primera.headers.get("authorization")).toBe("Bearer clave-openrouter-de-prueba");
    expect(primera.body.model).toBe("modelo/de-prueba");
    const mensajes = primera.body.messages as Array<{ role: string; content: string }>;
    expect(mensajes[0].role).toBe("system");
    expect(mensajes[0].content).toContain("Calificado");
    expect(mensajes.at(-1)).toEqual({ role: "user", content: TEXTO_ENTRANTE });
    const tools = (primera.body.tools as Array<{ function: { name: string } }>).map((t) => t.function.name);
    expect(tools).toContain("mover_etapa");

    const resultadoTool = (segunda.body.messages as Array<{ role: string; tool_call_id?: string; content: string }>).find(
      (m) => m.role === "tool"
    );
    expect(resultadoTool?.tool_call_id).toBe("call_mover_1");
    expect(JSON.parse(resultadoTool!.content)).toMatchObject({ ok: true, data: { etapa: "Calificado" } });

    // 4. La respuesta salio por Zernio, a la conversacion y cuenta correctas.
    expect(llamadas.zernio).toHaveLength(1);
    const envio = llamadas.zernio[0];
    expect(envio.method).toBe("POST");
    expect(envio.url).toBe(`${ZERNIO_API}/inbox/conversations/${CONVERSACION_ZERNIO}/messages`);
    expect(envio.headers.get("authorization")).toBe("Bearer clave-zernio-de-prueba");
    expect(envio.body).toEqual({ accountId: CUENTA_ZERNIO, message: RESPUESTA_AGENTE });

    // 5. Y todo quedo en la base.
    const [evento] = await db.select().from(s.webhookEvents).where(eq(s.webhookEvents.eventId, "evt_1"));
    expect(evento.status).toBe("processed");

    const [conversacion] = await db
      .select()
      .from(s.conversations)
      .where(eq(s.conversations.externalId, CONVERSACION_ZERNIO));
    expect(conversacion).toMatchObject({ provider: "zernio", channel: "whatsapp" });

    const [contacto] = await db.select().from(s.contacts).where(eq(s.contacts.id, conversacion.contactId!));
    expect(contacto.name).toBe("Ana Prueba");

    const hilo = await db
      .select()
      .from(s.messages)
      .where(eq(s.messages.conversationId, conversacion.id))
      .orderBy(asc(s.messages.createdAt));
    expect(hilo.map((m) => [m.direction, m.body])).toEqual([
      ["in", TEXTO_ENTRANTE],
      ["out", RESPUESTA_AGENTE],
    ]);
    expect(hilo[1]).toMatchObject({ origin: "agent", status: "sent", externalId: "wamid.salida-1" });

    const jobs = await db.select().from(s.agentJobs).where(eq(s.agentJobs.conversationId, conversacion.id));
    expect(jobs.map((j) => j.status)).toEqual(["done"]);

    const operaciones = await db
      .select({ etapa: s.pipelineStages.key })
      .from(s.deals)
      .innerJoin(s.pipelineStages, eq(s.deals.stageId, s.pipelineStages.id))
      .where(eq(s.deals.contactId, contacto.id));
    expect(operaciones).toEqual([{ etapa: "calificado" }]);

    const notas = await db
      .select({ descripcion: s.activities.description })
      .from(s.activities)
      .where(and(eq(s.activities.contactId, contacto.id), eq(s.activities.type, "note")));
    expect(notas.map((n) => n.descripcion).join("\n")).toMatch(/Agente IA .* "Calificado"/);
  }, 30_000);

  it("el reintento del mismo evento no vuelve a contestar", async () => {
    // Zernio entrega at-least-once: el mismo id tiene que quedar en el claim.
    const res = await postWebhook(payloadEntrante("evt_1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: true });
    expect(estado.pendientesAfter).toHaveLength(0);
    expect(llamadas.openrouter).toHaveLength(2);
    expect(llamadas.zernio).toHaveLength(1);
  });
});
