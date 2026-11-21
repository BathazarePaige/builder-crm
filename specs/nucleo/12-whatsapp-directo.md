# Spec: WhatsApp directo por Meta Cloud API (recibir y conectar)

**Carril**: completo (contrato publico: webhook de Meta y ruta nueva de API)
**Estado**: implementada
**Fecha**: 2026-11-20
**Escrita antes del codigo**: no (se escribio junto con la implementacion; documenta lo hecho)

## Problema

El conector `meta-cloud` enviaba pero no recibia: la ingesta vivia en una ruta legacy
(`/api/webhooks/whatsapp`) con su propio insert de mensajes, sin `webhook_events`, sin
barrido y con un estado que se perdia si llegaba antes que el mensaje. Y no habia forma
de conectar un numero sin correr un script contra la base.

## Decisiones del dueno

- D1 Seguir el README de conectores: mover la recepcion al conector y agregar un flujo
  de conexion en Ajustes (tarea del hilo "Finish the direct WhatsApp connector").
- D2 (de 03-conectores) Zernio sigue siendo el camino normal; Meta directo se activa con
  `WHATSAPP_PROVIDER=meta`.

## Escenarios

1. **Registrar el webhook** — En la app de Meta se pone `https://<instancia>/api/webhooks/whatsapp`
   y el verify token; Meta hace el GET del hub y recibe el challenge.
2. **Conectar un numero** — Un admin, en Ajustes -> Canales -> WhatsApp directo, pega
   phone number id, WABA id y token. Si el token no sirve para ese id, ve el error de
   Meta y no se guarda nada. Si sirve, el numero aparece conectado y la app queda
   suscrita al WABA.
3. **Recibir** — Un cliente escribe; el mensaje aparece en la bandeja en el hilo de
   WhatsApp del contacto (nuevo o existente por telefono) y se encola el agente.
4. **Estados** — Los `delivered`/`read`/`failed` actualizan el mensaje saliente. Uno que
   llega antes que el mensaje queda pendiente y lo reintenta el barrido.
5. **Desconectar** — El admin desconecta el numero: se borra el token y el webhook deja
   de ingresar sus mensajes.

## Requisitos

- FR-001 `metaCloud.webhook` implementa `verificar` (`X-Hub-Signature-256`,
  fail-closed sin `WHATSAPP_APP_SECRET`), `idEvento` (`meta:<wamid>` o
  `meta:<wamid>:<estado>`) y `procesar` (import dinamico de `meta-cloud-ingesta.ts`).
- FR-002 `/api/webhooks/whatsapp` es `manejarWebhook(metaCloud)`; el `GET` con
  `hub.mode` hace el handshake (fail-closed sin `WHATSAPP_WEBHOOK_VERIFY_TOKEN`) y sin el
  hace `barrerWebhook`. La URL no cambia. Se suma a los barridos.
- FR-003 La ingesta usa `findOrCreateContactByIdentity`, `upsertConversation`
  (`provider: meta`, `externalId: legacy:<contactId>` para seguir el hilo existente),
  `ingestMessage` y `updateMessageStatus`. BSUID en `wa_id` -> telefono de `from` y el
  BSUID como segunda identidad.
- FR-004 Solo ingesta numeros con fila activa en `whatsapp_accounts` y solo con
  `WHATSAPP_PROVIDER=meta`.
- FR-005 `GET/POST/DELETE /api/channels/meta`, solo admin. `POST` valida con zod
  (`meta-cloud-conexion.ts`), comprueba el token con Graph, suscribe la app al WABA y
  guarda; el token nunca se devuelve. Una cuenta activa por tenant (Fase 1).
- FR-006 Un reintento (`retry`) igual dispara los jobs del agente que ya se encolaron.

## Configuracion y modulos

Ninguno. Variables existentes: `WHATSAPP_PROVIDER`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `APP_BASE_URL`.

## Modelo de datos

Sin migraciones. `whatsapp_accounts.status` pasa a usarse (`active` / `disconnected`).

## Agente de IA

Sin cambios: responde por `deliverMessage`.

## Criterios de aceptacion

- CA-001 Firma invalida -> 401; mismo evento dos veces -> `duplicate: true`.
- CA-002 Handshake con token correcto devuelve el challenge; con otro, 403.
- CA-003 Mensaje firmado de un numero registrado -> fila en `messages`
  (`provider = meta`), hilo en la bandeja y job del agente.
- CA-004 `read` de un mensaje existente -> `status = read` y `read_at`; estado de un
  mensaje inexistente -> evento en `received` con un intento, para el barrido.
- CA-005 `tests/whatsapp-directo.test.ts` y `test + typecheck + lint + build` en verde.

CA-001..004 se verificaron con `npm run local` y payloads firmados a mano.

## Constitution Check

- I. Nucleo: es nucleo (conector); el cliente solo configura variables y conecta el numero.
- II. Spec: esta (escrita junto al codigo, dicho arriba).
- III. Autoverificacion: tests sin base + prueba local de punta a punta.
- IV. Cero secretos: el token vive en la base, como antes con el script; nunca en codigo
  ni en respuestas de la API.

## Ampliacion 2026-11-21: asistente con la ventana de Meta (Embedded Signup)

Pedido del dueno: conectar WhatsApp desde el CRM con un flujo guiado (elegir numero
propio o nuevo, coexistencia con la app WhatsApp Business, una explicacion y un guia paso
a paso al lado de la ventana de Meta).

- FR-007 Asistente en frances en Ajustes -> Canales: elegir caso, explicacion con casilla
  "compris", guia de 7 pasos con la ventana de Meta, pantalla final (PIN si es nuevo).
- FR-008 `FB.login` con `config_id` y `featureType: whatsapp_business_app_onboarding` en
  coexistencia; los `postMessage` solo se aceptan de https://*.facebook.com.
- FR-009 `POST /api/channels/meta/embedded` (admin): cambia el code por el token con el
  secreto de la app, registra el numero si es nuevo, suscribe la app al WABA, guarda.
- FR-010 `smb_message_echoes` entra como mensaje saliente.
- FR-012 Modelo SaaS (pedido del dueno 2026-11-21: que cualquier cliente conecte su
  numero): la suscripcion al WABA lleva `override_callback_uri` hacia la instancia, para
  que una sola app de Meta (Tech Provider) sirva a muchas instancias.
- FR-011 Sin `META_APP_ID`, `META_ES_CONFIG_ID` o `WHATSAPP_APP_SECRET`, el asistente lo
  dice y ofrece solo la carga manual.

## Fuera de alcance

- Una sola instancia multi-cliente: descartado por el dueno (2026-11-21), se queda una instancia por cliente. Sincronizar contactos e historial de la app
  (`smb_app_data`).
- Medios (descargar imagenes/audios de Graph): se guardan como `[imagen]`, `[audio]`.
