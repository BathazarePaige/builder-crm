import "server-only";
import { db } from "@/db";
import { activities, contacts, deals, messages, conversations, pipelineStages, pipelines } from "@/db/schema";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { displayName, listMembers, ownerFilter, type TeamMember } from "@/lib/team";
import { getConfig } from "@/lib/config";
import {
  acumular,
  embudoAcumulado,
  indiceTramo,
  prever,
  variacion,
  ventanas,
  type NivelEmbudo,
  type Periodo,
} from "./calculs";

/**
 * Datos del tablero, con la visibilidad del miembro (un asesor ve solo lo que cuelga
 * de sus contactos). Todo sale serializable para los componentes cliente: fechas como
 * texto ISO, montos en centavos.
 *
 * "Ganada en tal fecha" usa `deals.updated_at` de las operaciones en una etapa
 * ganada: la tabla no guarda la fecha de cierre, y mover de etapa la actualiza.
 */

export interface Indicador {
  valor: number | null;
  variacion: number | null;
  serie: number[];
}

export interface DatosTablero {
  nombre: string;
  indicadores: {
    ingresos: Indicador;
    contactos: Indicador;
    valorMedio: Indicador;
    conversion: Indicador;
  };
  ingresosAnio: Array<{ mes: number; real: number | null; prevision: number | null }>;
  ingresos12m: Array<{ mes: number; anio: number; real: number | null; prevision: number | null }>;
  embudo: NivelEmbudo[];
  fuentes: Array<{ fuente: string; cantidad: number }>;
  mejoresOperaciones: Array<{ id: string; titulo: string; valor: number; contacto: string | null }>;
  porEtapa: Array<{
    etapa: string;
    color: string;
    total: number;
    operaciones: Array<{ id: string; titulo: string; probabilidad: number; cierre: string | null; contacto: string | null }>;
  }>;
  eventos: Array<{ id: string; tipo: string; descripcion: string; fecha: string; contacto: string }>;
  tareas: Array<{ id: string; descripcion: string; fecha: string | null; hecha: boolean; atrasada: boolean; contacto: string }>;
  recientes: Array<{ id: string; tipo: string; descripcion: string; fecha: string; contacto: string }>;
  equipo: Array<{ id: string; nombre: string; rol: string; ganadas: number; total: number; rendimiento: number | null }>;
  agente: { respuestas: number; total: number; derivaciones: number };
  hayDatos: boolean;
}

/** Mes (0-11) y anio de una fecha en la zona horaria de la instancia. */
function mesLocal(d: Date): { mes: number; anio: number } {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: getConfig().zonaHoraria, year: "numeric", month: "numeric" }).formatToParts(d);
  return { anio: Number(p.find((x) => x.type === "year")?.value), mes: Number(p.find((x) => x.type === "month")?.value) - 1 };
}

export async function datosTablero(member: TeamMember, periodo: Periodo, ahora = new Date()): Promise<DatosTablero> {
  const v = ventanas(periodo, ahora);
  const soloMios = ownerFilter(member);
  const noSimulados = ne(contacts.source, "simulador");

  const [filasContactos, totalContactos, filasOperaciones, etapas, filasEventos, filasTareas, filasRecientes, miembros, filasSalientes] =
    await Promise.all([
      db
        .select({ source: contacts.source, createdAt: contacts.createdAt })
        .from(contacts)
        .where(and(noSimulados, soloMios, gte(contacts.createdAt, new Date(v.inicioPrevio)))),
      db
        .select({ n: sql<number>`count(*)` })
        .from(contacts)
        .where(and(noSimulados, soloMios)),
      db
        .select({
          id: deals.id,
          titulo: deals.title,
          valor: deals.value,
          probabilidad: deals.probability,
          stageId: deals.stageId,
          creada: deals.createdAt,
          actualizada: deals.updatedAt,
          cierre: deals.expectedClose,
          contacto: contacts.name,
          ownerId: contacts.ownerId,
        })
        .from(deals)
        .innerJoin(contacts, eq(deals.contactId, contacts.id))
        .where(and(noSimulados, soloMios)),
      db
        .select({
          id: pipelineStages.id,
          nombre: pipelineStages.name,
          orden: pipelineStages.order,
          color: pipelineStages.color,
          ganada: pipelineStages.isWon,
          perdida: pipelineStages.isLost,
          porDefecto: pipelines.isDefault,
        })
        .from(pipelineStages)
        .innerJoin(pipelines, eq(pipelines.id, pipelineStages.pipelineId))
        .orderBy(asc(pipelines.order), asc(pipelineStages.order)),
      db
        .select({ id: activities.id, tipo: activities.type, descripcion: activities.description, fecha: activities.scheduledAt, contacto: contacts.name })
        .from(activities)
        .innerJoin(contacts, eq(activities.contactId, contacts.id))
        .where(and(soloMios, isNull(activities.completedAt), gte(activities.scheduledAt, ahora)))
        .orderBy(asc(activities.scheduledAt))
        .limit(3),
      db
        .select({
          id: activities.id,
          descripcion: activities.description,
          fecha: activities.scheduledAt,
          hecha: activities.completedAt,
          contacto: contacts.name,
        })
        .from(activities)
        .innerJoin(contacts, eq(activities.contactId, contacts.id))
        .where(
          and(
            soloMios,
            isNotNull(activities.scheduledAt),
            or(
              and(isNull(activities.completedAt), lte(activities.scheduledAt, finDelDia(ahora))),
              gte(activities.completedAt, inicioDelDia(ahora))
            )
          )
        )
        .orderBy(asc(activities.scheduledAt))
        .limit(6),
      db
        .select({ id: activities.id, tipo: activities.type, descripcion: activities.description, fecha: activities.createdAt, contacto: contacts.name })
        .from(activities)
        .innerJoin(contacts, eq(activities.contactId, contacts.id))
        .where(soloMios)
        .orderBy(desc(activities.createdAt))
        .limit(5),
      listMembers({ onlyActive: true }),
      db
        .select({ origen: messages.origin, n: sql<number>`count(*)` })
        .from(messages)
        .innerJoin(conversations, eq(messages.conversationId, conversations.id))
        .innerJoin(contacts, eq(conversations.contactId, contacts.id))
        .where(and(noSimulados, soloMios, eq(messages.direction, "outbound"), gte(messages.createdAt, new Date(v.inicio))))
        .groupBy(messages.origin),
    ]);

  // Etapas del pipeline por defecto (o del primero si ninguno lo es).
  const hayPorDefecto = etapas.some((e) => e.porDefecto);
  const etapasPipeline = etapas.filter((e) => (hayPorDefecto ? e.porDefecto : true));
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const esGanada = (stageId: string) => etapaDe.get(stageId)?.ganada ?? false;
  const esPerdida = (stageId: string) => etapaDe.get(stageId)?.perdida ?? false;
  const abiertas = filasOperaciones.filter((o) => !esGanada(o.stageId) && !esPerdida(o.stageId));

  // --- Indicadores ---------------------------------------------------------------
  const enVentana = (d: Date) => d.getTime() >= v.inicio && d.getTime() <= v.fin;
  const enPrevia = (d: Date) => d.getTime() >= v.inicioPrevio && d.getTime() < v.inicio;
  const vacia = () => Array<number>(v.tramos).fill(0);

  const ganadas = filasOperaciones.filter((o) => esGanada(o.stageId));
  const cerradas = filasOperaciones.filter((o) => esGanada(o.stageId) || esPerdida(o.stageId));

  const ingresosTramos = vacia();
  for (const o of ganadas) {
    const i = indiceTramo(o.actualizada.getTime(), v);
    if (i >= 0) ingresosTramos[i] += o.valor;
  }
  const ingresos = ganadas.filter((o) => enVentana(o.actualizada)).reduce((s, o) => s + o.valor, 0);
  const ingresosPrev = ganadas.filter((o) => enPrevia(o.actualizada)).reduce((s, o) => s + o.valor, 0);

  const contactosTramos = vacia();
  for (const c of filasContactos) {
    const i = indiceTramo(c.createdAt.getTime(), v);
    if (i >= 0) contactosTramos[i] += 1;
  }
  const nuevos = filasContactos.filter((c) => enVentana(c.createdAt)).length;
  const nuevosPrev = filasContactos.filter((c) => enPrevia(c.createdAt)).length;

  const creadas = filasOperaciones.filter((o) => enVentana(o.creada));
  const creadasPrev = filasOperaciones.filter((o) => enPrevia(o.creada));
  const media = (xs: typeof creadas) => (xs.length ? Math.round(xs.reduce((s, o) => s + o.valor, 0) / xs.length) : 0);
  const sumaTramos = vacia();
  const cuentaTramos = vacia();
  for (const o of creadas) {
    const i = indiceTramo(o.creada.getTime(), v);
    if (i >= 0) {
      sumaTramos[i] += o.valor;
      cuentaTramos[i] += 1;
    }
  }
  const sumaAc = acumular(sumaTramos);
  const cuentaAc = acumular(cuentaTramos);

  const cerradasV = cerradas.filter((o) => enVentana(o.actualizada));
  const cerradasP = cerradas.filter((o) => enPrevia(o.actualizada));
  const tasa = (xs: typeof cerradas) => (xs.length ? Math.round((xs.filter((o) => esGanada(o.stageId)).length / xs.length) * 1000) / 10 : null);
  const ganTramos = vacia();
  const cerTramos = vacia();
  for (const o of cerradasV) {
    const i = indiceTramo(o.actualizada.getTime(), v);
    if (i >= 0) {
      cerTramos[i] += 1;
      if (esGanada(o.stageId)) ganTramos[i] += 1;
    }
  }
  const ganAc = acumular(ganTramos);
  const cerAc = acumular(cerTramos);
  const conversion = tasa(cerradasV);
  const conversionPrev = tasa(cerradasP);

  // --- Ingresos por mes y prevision ------------------------------------------------
  const hoy = mesLocal(ahora);
  const porMes = new Map<string, number>();
  for (const o of ganadas) {
    const { mes, anio } = mesLocal(o.actualizada);
    porMes.set(`${anio}-${mes}`, (porMes.get(`${anio}-${mes}`) ?? 0) + o.valor);
  }
  const realesAnio = Array.from({ length: hoy.mes + 1 }, (_, m) => porMes.get(`${hoy.anio}-${m}`) ?? 0);
  const previstosAnio = prever(realesAnio, 11 - hoy.mes);
  const ingresosAnio = Array.from({ length: 12 }, (_, m) => ({
    mes: m,
    real: m <= hoy.mes ? realesAnio[m] : null,
    prevision: m === hoy.mes ? realesAnio[m] : m > hoy.mes ? previstosAnio[m - hoy.mes - 1] : null,
  }));
  const meses12 = Array.from({ length: 12 }, (_, i) => {
    const total = hoy.anio * 12 + hoy.mes - 11 + i;
    return { anio: Math.floor(total / 12), mes: total % 12 };
  });
  const ingresos12m = meses12.map(({ anio, mes }) => ({ anio, mes, real: porMes.get(`${anio}-${mes}`) ?? 0, prevision: null }));

  // --- Embudo, fuentes, mejores operaciones, columnas ----------------------------
  const etapasEmbudo = etapasPipeline
    .filter((e) => !e.perdida)
    .map((e) => ({ nombre: e.nombre, cantidad: filasOperaciones.filter((o) => o.stageId === e.id).length }));
  const embudo = embudoAcumulado(etapasEmbudo);

  const porFuente = new Map<string, number>();
  for (const c of filasContactos.filter((c) => enVentana(c.createdAt))) {
    porFuente.set(c.source, (porFuente.get(c.source) ?? 0) + 1);
  }
  const fuentes = [...porFuente.entries()].map(([fuente, cantidad]) => ({ fuente, cantidad })).sort((a, b) => b.cantidad - a.cantidad);

  const mejoresOperaciones = [...abiertas]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((o) => ({ id: o.id, titulo: o.titulo, valor: o.valor, contacto: o.contacto }));

  const abiertasPipeline = etapasPipeline.filter((e) => !e.ganada && !e.perdida);
  const columnas = [...abiertasPipeline.slice(-3), ...etapasPipeline.filter((e) => e.ganada).slice(0, 1)];
  const porEtapa = columnas.map((e) => {
    const deEtapa = filasOperaciones
      .filter((o) => o.stageId === e.id)
      .sort((a, b) => b.actualizada.getTime() - a.actualizada.getTime());
    return {
      etapa: e.nombre,
      color: e.color,
      total: deEtapa.length,
      operaciones: deEtapa.slice(0, 2).map((o) => ({
        id: o.id,
        titulo: o.titulo,
        probabilidad: o.probabilidad,
        cierre: o.cierre?.toISOString() ?? null,
        contacto: o.contacto,
      })),
    };
  });

  // --- Equipo ----------------------------------------------------------------------
  const visibles = member.role === "admin" ? miembros : miembros.filter((m) => m.id === member.id);
  const equipo = visibles.map((m) => {
    const suyas = filasOperaciones.filter((o) => o.ownerId === m.id);
    const ganadasM = suyas.filter((o) => esGanada(o.stageId)).length;
    const cerradasM = suyas.filter((o) => esGanada(o.stageId) || esPerdida(o.stageId)).length;
    return {
      id: m.id,
      nombre: displayName(m),
      rol: m.role === "admin" ? "Admin" : getConfig().roles.etiquetaAsesor,
      ganadas: ganadasM,
      total: suyas.length,
      rendimiento: cerradasM ? Math.round((ganadasM / cerradasM) * 100) : null,
    };
  });

  const deAgente = filasSalientes.filter((f) => f.origen === "agent").reduce((s, f) => s + Number(f.n), 0);
  const salientes = filasSalientes.reduce((s, f) => s + Number(f.n), 0);
  const derivaciones = (
    await db
      .select({ n: sql<number>`count(*)` })
      .from(contacts)
      .where(and(noSimulados, soloMios, eq(contacts.needsHuman, true)))
  )[0];

  return {
    nombre: (member.name?.trim() || member.email.split("@")[0]).split(/\s+/)[0],
    indicadores: {
      ingresos: { valor: ingresos, variacion: variacion(ingresos, ingresosPrev), serie: acumular(ingresosTramos) },
      contactos: { valor: nuevos, variacion: variacion(nuevos, nuevosPrev), serie: contactosTramos },
      valorMedio: {
        valor: media(creadas),
        variacion: variacion(media(creadas), media(creadasPrev)),
        serie: sumaAc.map((s, i) => (cuentaAc[i] ? Math.round(s / cuentaAc[i]) : 0)),
      },
      conversion: {
        valor: conversion,
        variacion: conversion !== null && conversionPrev !== null ? Math.round((conversion - conversionPrev) * 10) / 10 : null,
        serie: ganAc.map((g, i) => (cerAc[i] ? Math.round((g / cerAc[i]) * 100) : 0)),
      },
    },
    ingresosAnio,
    ingresos12m,
    embudo,
    fuentes,
    mejoresOperaciones,
    porEtapa,
    eventos: filasEventos.map((e) => ({ id: e.id, tipo: e.tipo, descripcion: e.descripcion, fecha: e.fecha!.toISOString(), contacto: e.contacto })),
    tareas: filasTareas.slice(0, 5).map((t) => ({
      id: t.id,
      descripcion: t.descripcion,
      fecha: t.fecha?.toISOString() ?? null,
      hecha: t.hecha !== null,
      atrasada: t.hecha === null && t.fecha !== null && t.fecha < inicioDelDia(ahora),
      contacto: t.contacto,
    })),
    recientes: filasRecientes.map((r) => ({ id: r.id, tipo: r.tipo, descripcion: r.descripcion, fecha: r.fecha.toISOString(), contacto: r.contacto })),
    equipo,
    agente: { respuestas: deAgente, total: salientes, derivaciones: Number(derivaciones?.n ?? 0) },
    hayDatos: Number(totalContactos[0]?.n ?? 0) > 0 || filasOperaciones.length > 0,
  };
}

/** Medianoche de hoy en la zona de la instancia, como instante UTC. */
function inicioDelDia(ahora: Date): Date {
  const tz = getConfig().zonaHoraria;
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ahora);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0) % 24;
  const transcurrido = ((n("hour") * 60 + n("minute")) * 60 + n("second")) * 1000;
  return new Date(Math.floor((ahora.getTime() - transcurrido) / 1000) * 1000);
}

function finDelDia(ahora: Date): Date {
  return new Date(inicioDelDia(ahora).getTime() + 86_400_000 - 1);
}
