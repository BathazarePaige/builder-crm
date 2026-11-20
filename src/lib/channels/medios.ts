import "server-only";

/**
 * Notas de voz e imagenes entrantes: se convierten en texto antes de guardar el mensaje.
 *
 * El agente lee el historial desde `messages.body`. Sin esto, un audio queda como
 * `[audio]` y el agente contesta a ciegas. El texto se resuelve UNA vez, en la ingesta,
 * y queda en el cuerpo: lo lee el asesor en la bandeja y el agente en cada vuelta sin
 * volver a pagar la transcripcion. Ver specs/nucleo/12-medios-entrantes.md.
 *
 * Regla de oro: falla abierta hacia la etiqueta de siempre. Si algo sale mal (descarga,
 * tamano, modelo), el mensaje entra como `[audio]` y el agente corre igual.
 */

export type TipoMedio = "audio" | "imagen";

export interface MedioEntrante {
  tipo: TipoMedio;
  /** URL https del archivo, tal como la manda el proveedor. */
  url: string;
  mimeType?: string | null;
}

export interface ArchivoMedio {
  datos: Buffer;
  mimeType: string;
}

export const MAX_BYTES_MEDIO = 10 * 1024 * 1024;
const TIMEOUT_DESCARGA_MS = 15_000;
const TIMEOUT_MODELO_MS = 30_000;
const MAX_CARACTERES = 2000;
const MODELO_DEFAULT = "google/gemini-2.5-flash";

/** Respuesta del modelo cuando el audio no tiene voz: se trata como sin resultado. */
const SIN_CONTENIDO = "(sin contenido)";

const PROMPTS: Record<TipoMedio, string> = {
  audio:
    "Transcribi literalmente esta nota de voz que mando un cliente. Devolve solo el " +
    `texto, en el idioma original, sin comillas ni comentarios. Si no se entiende ninguna palabra, responde exactamente: ${SIN_CONTENIDO}`,
  imagen:
    "Un cliente mando esta imagen por chat a un negocio. Describila en una a tres frases " +
    "para que un asesor de ventas sepa que mando sin verla: que se ve y cualquier dato " +
    "util (producto, modelo, precio, direccion, error en pantalla). Si tiene texto " +
    "legible, transcribilo. Devolve solo la descripcion, en espanol.",
};

// ============================================================
// Configuracion
// ============================================================

/** `MEDIOS_MODELO=off` apaga el enriquecimiento; sin clave de OpenRouter tampoco corre. */
export function modeloMedios(env: Record<string, string | undefined> = process.env): string | null {
  if (!env.OPENROUTER_API_KEY) return null;
  const valor = env.MEDIOS_MODELO?.trim();
  if (valor && ["off", "false", "0", "no"].includes(valor.toLowerCase())) return null;
  return valor || MODELO_DEFAULT;
}

// ============================================================
// De que medio se trata (puro)
// ============================================================

function tipoPorNombre(kind: string | undefined, mime: string | null | undefined): TipoMedio | null {
  const k = (kind ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (k === "audio" || k === "voice" || k === "ptt" || (!k && m.startsWith("audio/"))) return "audio";
  if (k === "image" || (!k && m.startsWith("image/"))) return "imagen";
  return null;
}

/** Primer adjunto de un mensaje de Zernio, si es audio o imagen con URL https. */
export function medioDeZernio(
  attachments: Array<{ type?: string; url?: string; mimeType?: string }> | undefined
): MedioEntrante | null {
  const adjunto = attachments?.[0];
  if (!adjunto?.url) return null;
  const tipo = tipoPorNombre(adjunto.type, adjunto.mimeType);
  if (!tipo || !esHttps(adjunto.url)) return null;
  return { tipo, url: adjunto.url, mimeType: adjunto.mimeType ?? null };
}

/**
 * Cuerpo final del mensaje. `base` es la etiqueta de siempre (`[audio]`,
 * `[imagen] texto del cliente`, `[imagen] (+2)`): se conserva entera y el contenido va
 * despues, para que el asesor siga viendo que fue un medio y lo que escribio el cliente.
 */
export function cuerpoConMedio(base: string, tipo: TipoMedio, contenido: string | null): string {
  const limpio = limpiarSalida(contenido);
  if (!limpio) return base;
  const etiqueta = tipo === "audio" ? "Transcripcion" : "Descripcion";
  // Si el cliente escribio algo junto al medio, el contenido va en su propia linea.
  const soloEtiqueta = /^\[[^\]]+\](\s*\(\+\d+\))?$/.test(base.trim());
  const separador = soloEtiqueta ? " " : "\n";
  return `${base}${separador}${etiqueta}: ${limpio}`;
}

function limpiarSalida(texto: string | null | undefined): string | null {
  const t = texto?.trim().replace(/^["'“”]+|["'“”]+$/g, "").trim();
  if (!t) return null;
  if (t.toLowerCase() === SIN_CONTENIDO) return null;
  return t.length > MAX_CARACTERES ? `${t.slice(0, MAX_CARACTERES)}…` : t;
}

/** Formato de `input_audio` a partir del mime (WhatsApp manda notas de voz en ogg/opus). */
export function formatoAudio(mimeType: string): string {
  const m = mimeType.toLowerCase().split(";")[0].trim();
  const mapa: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/flac": "flac",
    "audio/amr": "amr",
  };
  return mapa[m] ?? (m.startsWith("audio/") ? m.slice("audio/".length) : "ogg");
}

function esHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

// ============================================================
// Descarga y modelo
// ============================================================

export interface DependenciasMedio {
  fetch: typeof fetch;
  /** Llama al modelo con el archivo y devuelve el texto. */
  interpretar: (tipo: TipoMedio, archivo: ArchivoMedio, modelo: string) => Promise<string | null>;
  modelo: string | null;
}

/**
 * Texto del medio, o null si no se pudo. Nunca lanza: el llamador sigue con la etiqueta.
 */
export async function interpretarMedio(
  medio: MedioEntrante,
  deps?: Partial<DependenciasMedio>
): Promise<string | null> {
  const modelo = deps?.modelo !== undefined ? deps.modelo : modeloMedios();
  if (!modelo) return null;
  try {
    const archivo = await descargar(medio, deps?.fetch ?? fetch);
    if (!archivo) return null;
    const interpretar = deps?.interpretar ?? interpretarConOpenRouter;
    return await interpretar(medio.tipo, archivo, modelo);
  } catch (err) {
    console.warn(`[medios] no se pudo interpretar ${medio.tipo}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Atajo para la ingesta: etiqueta de siempre + contenido si lo hubo. */
export async function enriquecerCuerpo(
  base: string,
  medio: MedioEntrante | null,
  deps?: Partial<DependenciasMedio>
): Promise<string> {
  if (!medio) return base;
  const contenido = await interpretarMedio(medio, deps);
  return cuerpoConMedio(base, medio.tipo, contenido);
}

async function descargar(medio: MedioEntrante, f: typeof fetch): Promise<ArchivoMedio | null> {
  if (!esHttps(medio.url)) throw new Error("url no https");
  const res = await f(medio.url, { signal: AbortSignal.timeout(TIMEOUT_DESCARGA_MS) });
  if (!res.ok) throw new Error(`descarga ${res.status}`);
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES_MEDIO) throw new Error("archivo demasiado grande");

  const datos = Buffer.from(await res.arrayBuffer());
  if (datos.length === 0) throw new Error("archivo vacio");
  if (datos.length > MAX_BYTES_MEDIO) throw new Error("archivo demasiado grande");

  const tipoHttp = res.headers.get("content-type");
  const final = medio.mimeType ?? (tipoHttp && !tipoHttp.startsWith("application/octet") ? tipoHttp : null);
  return {
    datos,
    mimeType: final ?? (medio.tipo === "audio" ? "audio/ogg" : "image/jpeg"),
  };
}

async function interpretarConOpenRouter(
  tipo: TipoMedio,
  archivo: ArchivoMedio,
  modelo: string
): Promise<string | null> {
  // Import dinamico: la ruta del webhook no tiene que cargar el SDK al arrancar.
  const { getOpenRouterClient } = await import("@/lib/agent/openrouter");
  const base64 = archivo.datos.toString("base64");
  const parte =
    tipo === "audio"
      ? { type: "input_audio", input_audio: { data: base64, format: formatoAudio(archivo.mimeType) } }
      : { type: "image_url", image_url: { url: `data:${archivo.mimeType.split(";")[0]};base64,${base64}` } };

  const respuesta = await getOpenRouterClient().chat.completions.create(
    {
      model: modelo,
      max_tokens: 800,
      temperature: 0,
      messages: [
        {
          role: "user",
          // OpenRouter acepta `input_audio` con mas formatos que el tipo del SDK (ogg).
          content: [{ type: "text", text: PROMPTS[tipo] }, parte] as never,
        },
      ],
    },
    // Sin reintentos: descarga + modelo tienen que caber holgados en los 2 minutos tras los
    // que el barrido de webhook.ts da el evento por colgado y lo reprocesa.
    { timeout: TIMEOUT_MODELO_MS, maxRetries: 0 }
  );
  return respuesta.choices[0]?.message?.content ?? null;
}
