import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyWebhookSignature } from "@/lib/meta-whatsapp";
import {
  cuerpoDeMensaje,
  esPayloadWhatsapp,
  idEventoMeta,
  leerCambiosMeta,
  respuestaHub,
  type MetaWebhookPayload,
} from "@/lib/channels/meta-cloud-eventos";
import { conexionMetaSchema, urlWebhookMeta } from "@/lib/channels/meta-cloud-conexion";

/**
 * El conector de WhatsApp directo (Meta Cloud API). Lo que se cubre aca falla en
 * silencio: una firma que deja pasar cualquier cosa, un `read` descartado como
 * duplicado del `delivered`, un BSUID guardado como si fuera telefono (contacto
 * duplicado), o un token mal pegado que se guarda y recien falla al contestar.
 */

const SECRETO = "secreto-de-la-app-de-meta";

function firmar(cuerpo: string, secreto = SECRETO): string {
  return `sha256=${crypto.createHmac("sha256", secreto).update(cuerpo).digest("hex")}`;
}

function payloadMensaje(over: Partial<{ waId: string; from: string; tipo: string; extra: object }> = {}): MetaWebhookPayload {
  const from = over.from ?? "5491155550000";
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "54 9 11 4444-0000", phone_number_id: "1234567890" },
              contacts: [{ wa_id: over.waId ?? from, profile: { name: " Ana " } }],
              messages: [
                {
                  id: "wamid.ABC",
                  from,
                  timestamp: "1700000000",
                  type: over.tipo ?? "text",
                  text: { body: "hola" },
                  ...(over.extra ?? {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function payloadEstado(status: string): MetaWebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1234567890" },
              statuses: [
                {
                  id: "wamid.OUT",
                  status,
                  timestamp: "1700000100",
                  recipient_id: "5491155550000",
                  ...(status === "failed" ? { errors: [{ code: 131047, title: "Re-engagement" }] } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("firma del webhook de Meta", () => {
  const cuerpo = JSON.stringify(payloadMensaje());

  it("acepta el cuerpo firmado con el secreto de la app", () => {
    expect(verifyWebhookSignature(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
  });

  it("rechaza todo si no hay secreto (fail-closed)", () => {
    expect(verifyWebhookSignature(cuerpo, firmar(cuerpo), "")).toBe(false);
  });

  it("rechaza sin cabecera, con otro secreto o con el cuerpo alterado", () => {
    expect(verifyWebhookSignature(cuerpo, null, SECRETO)).toBe(false);
    expect(verifyWebhookSignature(cuerpo, firmar(cuerpo, "otro"), SECRETO)).toBe(false);
    expect(verifyWebhookSignature(cuerpo.replace("hola", "hole"), firmar(cuerpo), SECRETO)).toBe(false);
  });

  it("no se rompe con una firma de largo distinto o que no es hex", () => {
    expect(() => verifyWebhookSignature(cuerpo, "sha256=abc", SECRETO)).not.toThrow();
    expect(verifyWebhookSignature(cuerpo, "sha256=abc", SECRETO)).toBe(false);
    expect(verifyWebhookSignature(cuerpo, `sha256=${"z".repeat(64)}`, SECRETO)).toBe(false);
  });
});

describe("handshake del hub", () => {
  const params = (token: string, mode = "subscribe") =>
    new URLSearchParams({ "hub.mode": mode, "hub.verify_token": token, "hub.challenge": "42" });

  it("devuelve el challenge si el token coincide", () => {
    expect(respuestaHub(params("tok"), "tok")).toBe("42");
  });

  it("rechaza token distinto, modo distinto o token sin configurar", () => {
    expect(respuestaHub(params("otro"), "tok")).toBeNull();
    expect(respuestaHub(params("tok", "unsubscribe"), "tok")).toBeNull();
    // Sin variable no se acepta ni un token vacio: si no, cualquiera registra el webhook.
    expect(respuestaHub(params(""), "")).toBeNull();
  });
});

describe("lectura del payload", () => {
  it("normaliza un mensaje de texto con su numero y el telefono del negocio", () => {
    const [cambio] = leerCambiosMeta(payloadMensaje());
    expect(cambio.phoneNumberId).toBe("1234567890");
    expect(cambio.telefonoNegocio).toBe("+5491144440000");
    expect(cambio.mensajes).toHaveLength(1);
    const m = cambio.mensajes[0];
    expect(m).toMatchObject({ wamid: "wamid.ABC", telefono: "+5491155550000", nombre: "Ana", cuerpo: "hola", bsuid: null });
    expect(m.enviadoEn.toISOString()).toBe("2023-11-14T22:13:20.000Z");
  });

  it("con un BSUID en wa_id usa el telefono de `from` y guarda el BSUID aparte", () => {
    const [cambio] = leerCambiosMeta(payloadMensaje({ waId: "AR.AbCdEfGh1234567" }));
    expect(cambio.mensajes[0].telefono).toBe("+5491155550000");
    expect(cambio.mensajes[0].bsuid).toBe("AR.AbCdEfGh1234567");
  });

  it("corrige la troncal argentina sin el 9 para no duplicar el contacto", () => {
    const [cambio] = leerCambiosMeta(payloadMensaje({ from: "541155550000" }));
    expect(cambio.mensajes[0].telefono).toBe("+5491155550000");
  });

  it("ignora cambios que no son de mensajes y objetos que no son WhatsApp", () => {
    const p = payloadMensaje();
    p.entry![0].changes![0].field = "message_template_status_update";
    expect(leerCambiosMeta(p)).toEqual([]);
    expect(esPayloadWhatsapp({ object: "page" })).toBe(false);
    expect(esPayloadWhatsapp(null)).toBe(false);
  });

  it("lee estados y guarda el error solo en los fallidos", () => {
    const [ok] = leerCambiosMeta(payloadEstado("delivered"));
    expect(ok.estados[0]).toMatchObject({ wamid: "wamid.OUT", status: "delivered", error: null });
    const [mal] = leerCambiosMeta(payloadEstado("failed"));
    expect(mal.estados[0].error).toContain("131047");
  });
});

describe("cuerpo del mensaje", () => {
  const base = { id: "w", from: "1", timestamp: "0" };
  it("traduce cada tipo a lo que ve la bandeja", () => {
    expect(cuerpoDeMensaje({ ...base, type: "image", image: { id: "i", caption: "foto" } })).toBe("[imagen] foto");
    expect(cuerpoDeMensaje({ ...base, type: "audio", audio: { id: "a" } })).toBe("[audio]");
    expect(cuerpoDeMensaje({ ...base, type: "document", document: { id: "d", filename: "a.pdf" } })).toBe("[documento] a.pdf");
    expect(cuerpoDeMensaje({ ...base, type: "location", location: { latitude: 1, longitude: 2 } })).toBe("[ubicacion] 1,2");
    expect(cuerpoDeMensaje({ ...base, type: "button", button: { text: "Si, quiero" } })).toBe("Si, quiero");
    expect(
      cuerpoDeMensaje({ ...base, type: "interactive", interactive: { button_reply: { title: "Agendar" } } })
    ).toBe("Agendar");
    expect(cuerpoDeMensaje({ ...base, type: "unsupported" })).toBe("[unsupported]");
  });
});

describe("id del evento para la idempotencia", () => {
  it("usa el wamid del mensaje", () => {
    expect(idEventoMeta(payloadMensaje())).toBe("meta:wamid.ABC");
  });

  it("distingue los estados del mismo mensaje", () => {
    // Si delivered y read compartieran id, el read se descartaria como duplicado y el
    // doble check azul no llegaria nunca a la bandeja.
    const delivered = idEventoMeta(payloadEstado("delivered"));
    const read = idEventoMeta(payloadEstado("read"));
    expect(delivered).toBe("meta:wamid.OUT:delivered");
    expect(read).not.toBe(delivered);
  });

  it("devuelve null si no hay nada que identificar (el nucleo usa el hash)", () => {
    expect(idEventoMeta({ object: "whatsapp_business_account", entry: [] })).toBeNull();
    expect(idEventoMeta({ object: "page" })).toBeNull();
  });
});

describe("datos para conectar un numero", () => {
  const valido = { phoneNumberId: " 1234567890 ", wabaId: "998877665544", accessToken: "EAAG" + "x".repeat(40) };

  it("acepta los ids con espacios alrededor y limpia el prefijo Bearer", () => {
    const r = conexionMetaSchema.parse({ ...valido, accessToken: `Bearer ${valido.accessToken}` });
    expect(r.phoneNumberId).toBe("1234567890");
    expect(r.accessToken).toBe(valido.accessToken);
  });

  it("permite dejar el WABA vacio", () => {
    expect(conexionMetaSchema.safeParse({ ...valido, wabaId: "" }).success).toBe(true);
  });

  it("rechaza un id no numerico, un token corto o con espacios", () => {
    expect(conexionMetaSchema.safeParse({ ...valido, phoneNumberId: "+54 11 5555" }).success).toBe(false);
    expect(conexionMetaSchema.safeParse({ ...valido, accessToken: "corto" }).success).toBe(false);
    expect(conexionMetaSchema.safeParse({ ...valido, accessToken: `${valido.accessToken} ${valido.accessToken}` }).success).toBe(false);
  });

  it("arma la URL del webhook sin doble barra", () => {
    expect(urlWebhookMeta("https://crm.cliente.com/")).toBe("https://crm.cliente.com/api/webhooks/whatsapp");
  });
});
