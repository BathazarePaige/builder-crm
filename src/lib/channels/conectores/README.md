# Conectores de canal

Un **conector** es por donde viaja un mensaje. La bandeja, el agente y Ajustes solo
conocen la interfaz `Conector` (`../conector.ts`): `enviar`, `webhook` y `estado`.

| Conector | Archivo | Canales | Estado |
|---|---|---|---|
| Zernio | `zernio.ts` | WhatsApp, Instagram, Messenger | Completo. Camino normal. |
| Meta Cloud API (directo) | `meta-cloud.ts` | WhatsApp | Completo con `WHATSAPP_PROVIDER=meta`: `enviar`, `webhook` (`/api/webhooks/whatsapp`) y `estado`. Numero conectado desde Ajustes. |
| Simulador | `simulador.ts` | todos (de prueba) | Guarda en vez de enviar; para demos y autoverificacion. |

## Como fluye un mensaje

- **Sale**: `deliverMessage` (`../deliver.ts`) resuelve el conector por
  `conversations.provider`, inserta la fila `pending`, llama a `enviar` y marca
  `sent`/`failed`. Nadie mas sale a la red.
- **Entra**: `POST /api/webhooks/<conector>` llama a `manejarWebhook(conector, req)`
  (`../webhook.ts`): verifica la firma con `webhook.verificar`, reclama el evento en
  `webhook_events` con `webhook.idEvento` (o el hash del cuerpo), responde 2xx y en
  `after()` corre `webhook.procesar`, que normaliza y persiste con `../ingest.ts`
  (`findOrCreateContactByIdentity`, `upsertConversation`, `ingestMessage`,
  `updateMessageStatus`). `GET` con `AGENT_WORKER_SECRET` barre lo que quedo colgado.
- **Estado**: `GET /api/channels` devuelve `estado()` de cada conector.

## WhatsApp directo (Meta Cloud API)

Spec: `specs/nucleo/12-whatsapp-directo.md`.

- **Entra**: `/api/webhooks/whatsapp` es `manejarWebhook(metaCloud, req)` como Zernio;
  el `GET` con `hub.mode` responde el handshake del hub y sin el hace el barrido.
  `verificar` usa `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`; `idEvento` es
  `meta:<wamid>` para mensajes y `meta:<wamid>:<estado>` para estados (si no, el `read`
  se descartaria como duplicado del `delivered`). La lectura del payload es pura
  (`../meta-cloud-eventos.ts`) y la persistencia (`../meta-cloud-ingesta.ts`) usa
  `ingest.ts`, igual que Zernio. Solo ingesta numeros activos de `whatsapp_accounts`
  y solo con `WHATSAPP_PROVIDER=meta` (si no, el agente contestaria dos veces).
- **Conectar**: Ajustes -> Canales -> WhatsApp direct (solo admin). El boton abre un
  asistente (`src/components/settings/whatsapp/`): elegir el caso (app WhatsApp Business
  en coexistencia, numero nuevo, o credenciales a mano), una explicacion de lo que va a
  pedir Meta y un guia paso a paso al lado de la ventana de Meta (Embedded Signup,
  `FB.login` con `config_id`). El navegador manda el `code` y los ids que Meta anuncia
  por `postMessage` a `/api/channels/meta/embedded`, que cambia el code por el token con
  `WHATSAPP_APP_SECRET`, registra el numero si es nuevo (PIN de 6 digitos), suscribe la
  app al WABA y guarda (`meta-cloud-alta.ts`). La carga manual va por `/api/channels/meta`.
  El token nunca vuelve al navegador. Variables: `META_APP_ID`, `META_ES_CONFIG_ID`.
- **Coexistencia**: lo que el negocio contesta desde el celular llega en
  `smb_message_echoes` y entra como saliente (sin disparar al agente).
- **Lado Meta** (una vez por app): app de tipo Business con WhatsApp y Facebook Login
  for Business; una configuracion de Embedded Signup (da el config id); el dominio de la
  instancia en "Allowed domains" del login; el webhook de la app apuntando a
  `/api/webhooks/whatsapp` con los campos `messages` y `smb_message_echoes`. Para conectar
  numeros de OTRAS empresas la app tiene que ser Tech Provider (verificacion del negocio
  y acceso avanzado a `whatsapp_business_management` y `whatsapp_business_messaging`);
  sin eso solo funciona con cuentas que administran la app.
- **Pendiente**: Tech Provider multi-instancia (la instancia recibe su token desde la
  plataforma de la agencia y el webhook se enruta con `override_callback_uri` por WABA),
  sincronizar contactos e historial de la app (`smb_app_data`) y descargar medios.
- **Probar**: mandar un mensaje real al numero de prueba de Meta y ver que entra en la
  bandeja; `probar-instancia` sigue cubriendo bandeja, agente y pipeline.

Nada de esto toca la bandeja ni el agente: hablan con `Conector`, no con Meta.

## Reglas

- Credenciales por entorno (`ZERNIO_*`, `WHATSAPP_*`), nunca en codigo.
- El modulo del conector importa solo lo liviano a nivel de modulo; la ingesta y el
  cliente HTTP se importan dinamicamente (Zernio exige 2xx en 5 s).
- Un conector nunca escribe en `messages` directo: devuelve `SendOutcome` y deja que
  `deliverMessage` persista.
