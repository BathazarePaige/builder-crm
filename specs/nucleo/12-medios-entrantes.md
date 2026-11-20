# Spec: notas de voz e imagenes que el agente entiende

**Carril**: completo — *toca la ingesta de mensajes (nucleo) y agrega una variable de entorno.*
**Estado**: implementada
**Fecha**: 2026-11-20
**Escrita antes del codigo**: si

## Problema

Cuando un cliente manda una nota de voz o una foto, el mensaje se guarda como `[audio]`
o `[imagen]`. El agente lee el historial desde `messages.body`, asi que lo unico que ve
es esa etiqueta: no sabe que le preguntaron ni que le mostraron. En WhatsApp la nota de
voz es la forma normal de escribir para mucha gente, y una foto de un producto o de una
propiedad suele ser la pregunta entera.

El sintoma no es un error: el agente contesta "no puedo escuchar audios" o, peor,
contesta otra cosa como si no hubiera pasado nada. El lead se enfria y nadie lo nota.

## Decisiones del dueno

- **D1** El contenido se resuelve en la ingesta, no en el agente: el texto queda en
  `messages.body`, asi que el asesor lo lee en la bandeja igual que el agente y no hay
  que volver a pagar la transcripcion cada vez que el agente relee el historial.
- **D2** Se usa el mismo proveedor que el agente (OpenRouter, misma clave), con un
  modelo propio para medios (`MEDIOS_MODELO`, default `google/gemini-2.5-flash`), porque
  el modelo del agente puede no aceptar audio. `MEDIOS_MODELO=off` lo apaga.
- **D3** Nunca bloquea la entrada del mensaje: si la descarga o el modelo fallan, el
  mensaje entra con la etiqueta de siempre.

## Escenarios

1. **Nota de voz** — el cliente manda un audio por WhatsApp; en la bandeja aparece
   `[audio] Transcripcion: quiero saber si tienen el depto de dos ambientes` y el agente
   contesta a eso.
2. **Foto** — el cliente manda una foto con o sin texto; el mensaje queda
   `[imagen] <texto del cliente>` y una linea `Descripcion: ...` debajo.
3. **Falla** — el proveedor de medios no responde o el archivo pesa demasiado; el
   mensaje entra como `[audio]` / `[imagen]`, igual que antes.
4. **Apagado** — sin `OPENROUTER_API_KEY` o con `MEDIOS_MODELO=off` no se descarga nada.

## Requisitos

- FR-001 Los mensajes ENTRANTES con audio o imagen DEBEN guardarse con la transcripcion
  o la descripcion en `body` cuando entran por Zernio (`attachments[].url`), que es el
  camino de los tres canales.
- FR-002 El enriquecimiento DEBE ocurrir antes de insertar el mensaje y antes de encolar
  al agente, para que el job del agente nunca lea la etiqueta vacia.
- FR-003 DEBE fallar abierto hacia la etiqueta: cualquier error (descarga, tamano,
  tipo, modelo, respuesta vacia) devuelve el cuerpo de siempre y queda en el log.
- FR-004 DEBE tener tope de tamano (10 MB), solo URLs `https` y tiempos maximos de
  descarga y de modelo, para no colgar el procesamiento del webhook.
- FR-005 NO DEBE enriquecer salientes, mensajes del backfill ni mensajes viejos (los
  mismos que no encolan al agente): costaria plata sobre historial que nadie va a
  contestar.
- FR-006 Solo se enriquece el primer adjunto; si hay mas, se mantiene el `(+N)`.

## Configuracion y modulos

Ninguno en `config/cliente.ts`. Variable nueva `MEDIOS_MODELO` (opcional) en
`.env.example` y en `src/lib/env.ts`.

## Modelo de datos

Ninguno. El texto va en `messages.body`; el adjunto original sigue en `raw_payload`.

## Agente de IA

Sin cambios de prompt: el historial ya trae el texto. La etiqueta `[audio]` / `[imagen]`
al inicio le dice que el cliente mando un medio y no texto.

## Criterios de aceptacion

- CA-001 Un audio entrante por Zernio queda en la bandeja con `Transcripcion:`.
- CA-002 Una imagen entrante queda con `Descripcion:` y conserva el texto del cliente.
- CA-003 Con el modelo caido el mensaje entra igual con `[audio]` y el agente corre.
- CA-004 Los tests de `tests/medios-entrantes.test.ts` pasan sin red.

## Constitution Check

- I. Nucleo intocable: cumple. Es una mejora generica del nucleo; ninguna instancia tiene
  que tocar `src/` para tenerla.
- II. Spec antes que codigo: cumple.
- III. Autoverificacion: tests sin red para la seleccion del medio, el armado del cuerpo
  y la falla abierta; el camino real se ve en la bandeja con un audio de prueba.
- IV. Cero secretos: cumple. Usa `OPENROUTER_API_KEY` y el token de la cuenta de
  WhatsApp que ya existen.

## Fuera de alcance

- El webhook de Meta directo (`WHATSAPP_PROVIDER=meta`, valvula de escape): procesa
  antes de responder 200, y sumarle una descarga y una llamada al modelo lo acerca al
  tiempo en que Meta reintenta. Hacerlo bien es mover ese handler a `after()` como el de
  Zernio, que es otro cambio.
- Video y documentos (PDF): mas caros y menos frecuentes; se mantienen las etiquetas.
- Guardar el archivo en el bucket propio: Zernio y Meta ya lo alojan, y la URL de Meta
  vence; si hace falta conservarlo es otra spec.
- Transcribir el historial que trae el backfill.
