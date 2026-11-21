import { describe, it, expect } from "vitest";
import {
  altaEmbebidaSchema,
  faltanParaSignup,
  leerEventoSignup,
  opcionesLogin,
  pinRegistro,
} from "@/lib/channels/meta-embedded-signup";
import { idEventoMeta, leerCambiosMeta } from "@/lib/channels/meta-cloud-eventos";

/**
 * La ventana de Meta (Embedded Signup) y la coexistencia con la app WhatsApp Business.
 * Lo que se cubre aca falla en silencio: un postMessage de otra pagina que el asistente
 * toma por el de Meta, un numero de la app que Meta rechaza porque falto el featureType,
 * o lo que el negocio contesto desde el celular que nunca aparece en la bandeja.
 */

const FB = "https://www.facebook.com";

describe("opciones de FB.login", () => {
  it("en coexistencia pide el flujo de la app WhatsApp Business", () => {
    const o = opcionesLogin("coexistencia", "123");
    expect(o.config_id).toBe("123");
    expect(o.response_type).toBe("code");
    expect(o.override_default_response_type).toBe(true);
    expect(o.extras.featureType).toBe("whatsapp_business_app_onboarding");
    expect(o.extras.sessionInfoVersion).toBe("3");
  });

  it("con un numero nuevo no manda featureType", () => {
    expect(opcionesLogin("nuevo", "123").extras).not.toHaveProperty("featureType");
  });
});

describe("eventos de la ventana de Meta", () => {
  const fin = (event: string, data: object = { phone_number_id: "111222333", waba_id: "444555666" }) =>
    JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event, data, version: 3 });

  it("lee el fin con los ids, como texto o como objeto", () => {
    expect(leerEventoSignup(FB, fin("FINISH"))).toEqual({
      tipo: "fin", phoneNumberId: "111222333", wabaId: "444555666", coexistencia: false,
    });
    expect(leerEventoSignup("https://web.facebook.com", JSON.parse(fin("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING")))).toMatchObject({
      tipo: "fin", coexistencia: true,
    });
  });

  it("ignora mensajes que no vienen de facebook.com", () => {
    expect(leerEventoSignup("https://facebook.com.evil.io", fin("FINISH"))).toBeNull();
    expect(leerEventoSignup("http://www.facebook.com", fin("FINISH"))).toBeNull();
    expect(leerEventoSignup("https://evilfacebook.com", fin("FINISH"))).toBeNull();
  });

  it("ignora otros mensajes de Facebook y JSON roto", () => {
    expect(leerEventoSignup(FB, JSON.stringify({ type: "OTRA_COSA" }))).toBeNull();
    expect(leerEventoSignup(FB, "{no es json")).toBeNull();
    expect(leerEventoSignup(FB, null)).toBeNull();
  });

  it("distingue cancelacion, error y WABA sin numero", () => {
    expect(leerEventoSignup(FB, fin("CANCEL", { current_step: "PHONE_NUMBER_SETUP" }))).toEqual({
      tipo: "cancelado", paso: "PHONE_NUMBER_SETUP",
    });
    expect(leerEventoSignup(FB, fin("ERROR", { error_message: "boom" }))).toEqual({ tipo: "error", mensaje: "boom" });
    expect(leerEventoSignup(FB, fin("FINISH_ONLY_WABA", { waba_id: "444555666" }))).toEqual({
      tipo: "fin_sin_numero", wabaId: "444555666",
    });
    expect(leerEventoSignup(FB, fin("FINISH", { waba_id: "444555666" }))).toMatchObject({ tipo: "fin_sin_numero" });
  });
});

describe("alta desde la ventana de Meta", () => {
  it("valida lo que manda el navegador", () => {
    const ok = { code: "AQD" + "x".repeat(30), phoneNumberId: "111222333", wabaId: "444555666", modo: "coexistencia" };
    expect(altaEmbebidaSchema.safeParse(ok).success).toBe(true);
    expect(altaEmbebidaSchema.safeParse({ ...ok, modo: "otro" }).success).toBe(false);
    expect(altaEmbebidaSchema.safeParse({ ...ok, code: "" }).success).toBe(false);
    expect(altaEmbebidaSchema.safeParse({ ...ok, wabaId: "abc" }).success).toBe(false);
  });

  it("dice que falta del entorno", () => {
    expect(faltanParaSignup({})).toEqual(["META_APP_ID", "META_ES_CONFIG_ID", "WHATSAPP_APP_SECRET"]);
    expect(faltanParaSignup({ META_APP_ID: "1", META_ES_CONFIG_ID: "2", WHATSAPP_APP_SECRET: "s" })).toEqual([]);
  });

  it("usa el PIN configurado o inventa uno de 6 digitos", () => {
    expect(pinRegistro("123456")).toBe("123456");
    expect(pinRegistro("12", () => 0.000042)).toBe("000042");
    expect(pinRegistro(undefined)).toMatch(/^\d{6}$/);
  });
});

describe("coexistencia: lo que se contesta desde el celular", () => {
  const eco = {
    object: "whatsapp_business_account",
    entry: [{
      changes: [{
        field: "smb_message_echoes",
        value: {
          metadata: { phone_number_id: "111222333" },
          message_echoes: [{ id: "wamid.ECO", from: "5491144440000", to: "525512345678", timestamp: "1700000000", type: "text", text: { body: "te escribo yo" } }],
        },
      }],
    }],
  };

  it("se lee como saliente hacia el cliente, con la troncal corregida", () => {
    const [cambio] = leerCambiosMeta(eco);
    expect(cambio.mensajes).toEqual([]);
    expect(cambio.ecos[0]).toMatchObject({ wamid: "wamid.ECO", telefono: "+5215512345678", cuerpo: "te escribo yo" });
  });

  it("tiene su propio id de evento", () => {
    expect(idEventoMeta(eco)).toBe("meta:wamid.ECO");
  });
});
