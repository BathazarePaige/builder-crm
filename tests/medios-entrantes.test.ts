import { describe, it, expect, vi } from "vitest";
import {
  cuerpoConMedio,
  enriquecerCuerpo,
  formatoAudio,
  MAX_BYTES_MEDIO,
  medioDeZernio,
  modeloMedios,
  type MedioEntrante,
} from "@/lib/channels/medios";

/**
 * Notas de voz e imagenes entrantes. Lo que falla en silencio aca es doble: si el
 * enriquecimiento se rompe hacia afuera (tira), el mensaje del cliente no entra y nadie
 * se entera; si se rompe hacia adentro (no corre), el agente vuelve a contestar a ciegas
 * a un `[audio]`. Ninguna de las dos da un error visible.
 */

const AUDIO: MedioEntrante = { tipo: "audio", url: "https://cdn.zernio.test/a.ogg", mimeType: "audio/ogg" };
const IMAGEN: MedioEntrante = { tipo: "imagen", url: "https://cdn.zernio.test/f.jpg", mimeType: "image/jpeg" };

function respuesta(bytes: number, headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}

describe("que medio trae un mensaje de Zernio", () => {
  it("reconoce audio e imagen por el tipo del adjunto", () => {
    expect(medioDeZernio([{ type: "audio", url: "https://x.test/a.ogg" }])?.tipo).toBe("audio");
    expect(medioDeZernio([{ type: "image", url: "https://x.test/f.jpg" }])?.tipo).toBe("imagen");
  });

  it("sin tipo, decide por el mime", () => {
    expect(medioDeZernio([{ url: "https://x.test/a", mimeType: "audio/mpeg" }])?.tipo).toBe("audio");
  });

  it("ignora video, documentos, adjuntos sin URL y URLs que no son https", () => {
    expect(medioDeZernio([{ type: "video", url: "https://x.test/v.mp4" }])).toBeNull();
    expect(medioDeZernio([{ type: "file", url: "https://x.test/d.pdf" }])).toBeNull();
    expect(medioDeZernio([{ type: "audio" }])).toBeNull();
    expect(medioDeZernio([{ type: "audio", url: "http://x.test/a.ogg" }])).toBeNull();
    expect(medioDeZernio(undefined)).toBeNull();
  });
});

describe("cuerpo del mensaje", () => {
  it("agrega la transcripcion despues de la etiqueta", () => {
    expect(cuerpoConMedio("[audio]", "audio", "hola, quiero el depto")).toBe(
      "[audio] Transcripcion: hola, quiero el depto"
    );
  });

  it("conserva lo que escribio el cliente y pone la descripcion en otra linea", () => {
    expect(cuerpoConMedio("[imagen] cuanto sale?", "imagen", "Una zapatilla roja")).toBe(
      "[imagen] cuanto sale?\nDescripcion: Una zapatilla roja"
    );
    expect(cuerpoConMedio("[imagen] (+2)", "imagen", "Un living")).toBe(
      "[imagen] (+2) Descripcion: Un living"
    );
  });

  it("sin contenido util deja la etiqueta de siempre", () => {
    expect(cuerpoConMedio("[audio]", "audio", null)).toBe("[audio]");
    expect(cuerpoConMedio("[audio]", "audio", "   ")).toBe("[audio]");
    expect(cuerpoConMedio("[audio]", "audio", "(sin contenido)")).toBe("[audio]");
  });

  it("recorta respuestas largas para no inflar el historial del agente", () => {
    const largo = cuerpoConMedio("[audio]", "audio", "a".repeat(5000));
    expect(largo.length).toBeLessThan(2100);
  });
});

describe("formato de audio para el modelo", () => {
  it("las notas de voz de WhatsApp (ogg/opus) van como ogg", () => {
    expect(formatoAudio("audio/ogg; codecs=opus")).toBe("ogg");
    expect(formatoAudio("audio/mpeg")).toBe("mp3");
    expect(formatoAudio("audio/mp4")).toBe("m4a");
  });
});

describe("cuando corre", () => {
  it("sin clave de OpenRouter no corre", () => {
    expect(modeloMedios({})).toBeNull();
  });

  it("MEDIOS_MODELO=off lo apaga y vacio usa el default", () => {
    expect(modeloMedios({ OPENROUTER_API_KEY: "k", MEDIOS_MODELO: "off" })).toBeNull();
    expect(modeloMedios({ OPENROUTER_API_KEY: "k" })).toBe("google/gemini-2.5-flash");
    expect(modeloMedios({ OPENROUTER_API_KEY: "k", MEDIOS_MODELO: "otro/modelo" })).toBe(
      "otro/modelo"
    );
  });
});

describe("falla abierta hacia la etiqueta", () => {
  it("con todo bien, el cuerpo trae la transcripcion y el modelo recibe el archivo", async () => {
    const interpretar = vi.fn().mockResolvedValue("necesito un presupuesto");
    const cuerpo = await enriquecerCuerpo("[audio]", AUDIO, {
      modelo: "m",
      fetch: vi.fn().mockResolvedValue(respuesta(10)),
      interpretar,
    });
    expect(cuerpo).toBe("[audio] Transcripcion: necesito un presupuesto");
    const [tipo, archivo, modelo] = interpretar.mock.calls[0];
    expect(tipo).toBe("audio");
    expect(archivo.datos.length).toBe(10);
    expect(archivo.mimeType).toBe("audio/ogg");
    expect(modelo).toBe("m");
  });

  it("si el modelo tira, entra con la etiqueta", async () => {
    const cuerpo = await enriquecerCuerpo("[imagen]", IMAGEN, {
      modelo: "m",
      fetch: vi.fn().mockResolvedValue(respuesta(10)),
      interpretar: vi.fn().mockRejectedValue(new Error("503")),
    });
    expect(cuerpo).toBe("[imagen]");
  });

  it("si la descarga falla, ni siquiera llama al modelo", async () => {
    const interpretar = vi.fn();
    const cuerpo = await enriquecerCuerpo("[audio]", AUDIO, {
      modelo: "m",
      fetch: vi.fn().mockResolvedValue(new Response("no", { status: 404 })),
      interpretar,
    });
    expect(cuerpo).toBe("[audio]");
    expect(interpretar).not.toHaveBeenCalled();
  });

  it("un archivo mas grande que el tope no se manda al modelo", async () => {
    const interpretar = vi.fn();
    const cuerpo = await enriquecerCuerpo("[audio]", AUDIO, {
      modelo: "m",
      fetch: vi
        .fn()
        .mockResolvedValue(respuesta(1, { "content-length": String(MAX_BYTES_MEDIO + 1) })),
      interpretar,
    });
    expect(cuerpo).toBe("[audio]");
    expect(interpretar).not.toHaveBeenCalled();
  });

  it("apagado no descarga nada", async () => {
    const f = vi.fn();
    const cuerpo = await enriquecerCuerpo("[audio]", AUDIO, { modelo: null, fetch: f });
    expect(cuerpo).toBe("[audio]");
    expect(f).not.toHaveBeenCalled();
  });

  it("sin medio devuelve el cuerpo tal cual", async () => {
    expect(await enriquecerCuerpo("hola", null)).toBe("hola");
  });
});
