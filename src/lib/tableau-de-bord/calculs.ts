/**
 * Calculos puros del tablero (sin base ni red): series por tramo, variacion contra el
 * periodo anterior, prevision mensual y embudo acumulado. Viven aparte de las consultas
 * para poder probarlos en tests/tablero.test.ts.
 */

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function leerPeriodo(valor: string | string[] | undefined): Periodo {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 7;
}

const DIA = 86_400_000;

/** Ventana actual y anterior, y el tamano de cada tramo de la curva (dia o semana). */
export function ventanas(periodo: Periodo, ahora: Date) {
  const fin = ahora.getTime();
  const inicio = fin - periodo * DIA;
  const inicioPrevio = inicio - periodo * DIA;
  const tramo = periodo <= 30 ? DIA : 7 * DIA;
  const tramos = Math.ceil((periodo * DIA) / tramo);
  return { fin, inicio, inicioPrevio, tramo, tramos };
}

/** Indice del tramo de `t` dentro de la ventana actual, o -1 si cae afuera. */
export function indiceTramo(t: number, v: ReturnType<typeof ventanas>): number {
  if (t < v.inicio || t > v.fin) return -1;
  return Math.min(v.tramos - 1, Math.floor((t - v.inicio) / v.tramo));
}

/** Suma acumulada: la curva de un total que crece dentro del periodo. */
export function acumular(serie: number[]): number[] {
  let total = 0;
  return serie.map((x) => (total += x));
}

/** Variacion en % contra el periodo anterior. null si no hay base para comparar. */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

/**
 * Prevision de los meses que faltan: recta por minimos cuadrados sobre los meses con
 * datos reales, que arranca en el ultimo valor real. Nunca baja de cero. Es una
 * tendencia, no una promesa: el tablero la dibuja punteada.
 */
export function prever(reales: number[], mesesFuturos: number): number[] {
  const n = reales.length;
  if (n === 0) return Array(mesesFuturos).fill(0);
  const ultimo = reales[n - 1];
  if (n === 1) return Array(mesesFuturos).fill(ultimo);
  const mx = (n - 1) / 2;
  const my = reales.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  reales.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const pendiente = den === 0 ? 0 : num / den;
  return Array.from({ length: mesesFuturos }, (_, i) => Math.max(0, Math.round(ultimo + pendiente * (i + 1))));
}

export interface NivelEmbudo {
  etiqueta: string;
  cantidad: number;
  /** % sobre el nivel anterior; null en el primero. */
  tasa: number | null;
}

/**
 * Embudo acumulado: una operacion en "Propuesta" ya paso por "Calificado", asi que
 * cuenta en todos los niveles hasta el suyo. Las perdidas no cuentan (no se sabe
 * hasta donde llegaron).
 */
export function embudoAcumulado(etapas: Array<{ nombre: string; cantidad: number }>): NivelEmbudo[] {
  const niveles = etapas.map((e, i) => ({
    etiqueta: e.nombre,
    cantidad: etapas.slice(i).reduce((s, x) => s + x.cantidad, 0),
  }));
  return niveles.map((nivel, i) => {
    const previo = i === 0 ? null : niveles[i - 1].cantidad;
    return {
      ...nivel,
      tasa: previo === null ? null : previo === 0 ? 0 : Math.round((nivel.cantidad / previo) * 1000) / 10,
    };
  });
}
