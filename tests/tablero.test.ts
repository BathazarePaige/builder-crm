import { describe, it, expect } from "vitest";
import {
  acumular,
  embudoAcumulado,
  indiceTramo,
  leerPeriodo,
  prever,
  variacion,
  ventanas,
} from "@/lib/tableau-de-bord/calculs";

describe("calculos del tablero", () => {
  it("lee el periodo de la URL y cae en 7 dias si no es valido", () => {
    expect(leerPeriodo("30")).toBe(30);
    expect(leerPeriodo("90")).toBe(90);
    expect(leerPeriodo("15")).toBe(7);
    expect(leerPeriodo(undefined)).toBe(7);
  });

  it("reparte por dia hasta 30 dias y por semana en 90", () => {
    const ahora = new Date("2026-11-20T12:00:00Z");
    expect(ventanas(7, ahora).tramos).toBe(7);
    expect(ventanas(90, ahora).tramos).toBe(13);
    const v = ventanas(7, ahora);
    expect(indiceTramo(v.inicio, v)).toBe(0);
    expect(indiceTramo(v.fin, v)).toBe(6);
    expect(indiceTramo(v.inicio - 1, v)).toBe(-1);
  });

  it("calcula la variacion y no inventa una cuando no hay base", () => {
    expect(variacion(150, 100)).toBe(50);
    expect(variacion(50, 100)).toBe(-50);
    expect(variacion(0, 0)).toBe(0);
    expect(variacion(10, 0)).toBeNull();
  });

  it("acumula y preve sin bajar de cero", () => {
    expect(acumular([1, 2, 3])).toEqual([1, 3, 6]);
    expect(prever([10, 20, 30], 2)).toEqual([40, 50]);
    expect(prever([30, 20, 10], 3)).toEqual([0, 0, 0]);
    expect(prever([], 2)).toEqual([0, 0]);
  });

  it("arma el embudo acumulado con la tasa sobre el nivel anterior", () => {
    const e = embudoAcumulado([
      { nombre: "Nouveau", cantidad: 2 },
      { nombre: "Qualifié", cantidad: 1 },
      { nombre: "Gagné", cantidad: 1 },
    ]);
    expect(e.map((n) => n.cantidad)).toEqual([4, 2, 1]);
    expect(e.map((n) => n.tasa)).toEqual([null, 50, 50]);
  });
});
