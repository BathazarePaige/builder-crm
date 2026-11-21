import clienteEntrada from "@config/cliente";
import { esquemaConfig, type ConfigCliente, type CampoConfig, type Marca } from "./schema";
import { camposDeModulos, erroresDeModulos } from "@/lib/modules/cliente";

/**
 * Punto unico de acceso a la configuracion del cliente.
 *
 *   const { marca, pipeline } = getConfig();
 *
 * Se valida una vez por proceso. Si la configuracion es invalida, `getConfig()` lanza
 * con el detalle; `erroresConfig()` devuelve la lista sin lanzar (para /api/health y
 * el arranque). Importable desde componentes cliente: no hay nada server-only.
 */

let cache: ConfigCliente | null = null;
let errores: string[] | null = null;

function validar(): { config: ConfigCliente | null; errores: string[] } {
  if (cache) return { config: cache, errores: [] };
  if (errores) return { config: null, errores };
  const r = esquemaConfig.safeParse(clienteEntrada);
  if (!r.success) {
    errores = r.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`);
    return { config: null, errores };
  }
  // Los modulos tambien aportan campos: sus errores y las claves repetidas son
  // errores de configuracion de la instancia.
  const problemas = [...erroresDeModulos()];
  const vistas = new Set(r.data.contacto.campos.map((c) => c.clave));
  for (const campo of camposDeModulos()) {
    if (vistas.has(campo.clave)) {
      problemas.push(`contacto.campos : la clé "${campo.clave}" est en double entre config/cliente.ts et un module`);
    }
    vistas.add(campo.clave);
  }
  if (problemas.length > 0) {
    errores = problemas;
    return { config: null, errores };
  }
  cache = r.data;
  return { config: cache, errores: [] };
}

export function getConfig(): ConfigCliente {
  const { config, errores } = validar();
  if (!config) {
    throw new Error(`config/cliente.ts invalide :\n${errores.map((e) => `  - ${e}`).join("\n")}`);
  }
  return config;
}

/** Lista de problemas de la configuracion (vacia si es valida). Nunca lanza. */
export function erroresConfig(): string[] {
  return validar().errores;
}

export function marca(): Marca {
  return getConfig().marca;
}

/** Campos del contacto: los de config/cliente.ts mas los de los modulos activos. */
export function camposContacto(): CampoConfig[] {
  return [...getConfig().contacto.campos, ...camposDeModulos()];
}

export function etiquetaAsesor(): string {
  return getConfig().roles.etiquetaAsesor;
}

/** Zona horaria IANA de la instancia. Ver `specs/nucleo/11-zona-horaria.md`. */
export function zonaHoraria(): string {
  return getConfig().zonaHoraria;
}

/** Locale de Intl para la interfaz, segun `idioma` de la config. */
export function localeIntl(): string {
  const { idioma } = getConfig();
  return idioma === "fr" ? "fr-FR" : idioma === "en" ? "en-US" : "es";
}

/** true si una funcion del nucleo o un modulo de `modules/` esta activo. */
export function moduloActivo(nombre: string): boolean {
  const { modulos } = getConfig();
  if (nombre in modulos.nucleo) {
    return modulos.nucleo[nombre as keyof typeof modulos.nucleo];
  }
  return modulos.activos.includes(nombre);
}

// --- Marca -> CSS -------------------------------------------------------------

function hexARgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function mezclar(hex: string, con: [number, number, number], peso: number): string {
  const a = hexARgb(hex);
  const m = a.map((c, i) => Math.round(c * (1 - peso) + con[i] * peso));
  return `#${m.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Texto blanco o negro segun contraste con el color dado (WCAG). */
export function textoSobre(hex: string): "#FFFFFF" | "#0A1628" {
  return luminancia(hexARgb(hex)) > 0.4 ? "#0A1628" : "#FFFFFF";
}

function contraste(a: string, b: string): number {
  const la = luminancia(hexARgb(a));
  const lb = luminancia(hexARgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * El primario usable como texto sobre blanco: si la marca es clara (un cian, un
 * amarillo) se oscurece hacia el tinta hasta llegar a 4.5:1 (WCAG AA).
 */
export function primarioTinta(hex: string): string {
  for (let peso = 0; peso <= 1; peso += 0.05) {
    const c = mezclar(hex, [24, 24, 27], peso);
    if (contraste(c, "#FFFFFF") >= 4.5) return c;
  }
  return "#18181B";
}

/**
 * Variables CSS derivadas de la marca. Se inyectan en <head> durante el SSR para que
 * no haya "flash" del color por defecto. `:root:root` gana en especificidad a los
 * defaults de globals.css sin depender del orden de carga.
 *
 * La sidebar puede ser clara u oscura: sus tonos (hover, borde, texto atenuado) se
 * derivan de colorSidebar para que cualquier color de la config se lea bien.
 */
export function cssVariablesMarca(): string {
  const { colorPrimario, colorSidebar } = marca();
  const primario = colorPrimario;
  const sobrePrimario = textoSobre(primario);
  const tinta = primarioTinta(primario);
  const suave = mezclar(primario, [255, 255, 255], 0.9);
  const suaveTexto = mezclar(tinta, [24, 24, 27], 0.3);
  const claro = mezclar(primario, [255, 255, 255], 0.45);
  const sidebar = colorSidebar;
  const oscura = textoSobre(sidebar) === "#FFFFFF";
  const sidebarTexto = oscura ? "#EDEDF0" : "#18181B";
  const sidebarAtenuado = oscura ? mezclar(sidebar, [237, 237, 240], 0.62) : mezclar(sidebar, [24, 24, 27], 0.66);
  const sidebarHover = oscura ? mezclar(sidebar, [255, 255, 255], 0.08) : mezclar(sidebar, [24, 24, 27], 0.05);
  const sidebarBorde = oscura ? mezclar(sidebar, [255, 255, 255], 0.1) : mezclar(sidebar, [24, 24, 27], 0.08);
  return [
    ":root:root{",
    `--primary:${primario};`,
    `--primary-foreground:${sobrePrimario};`,
    `--primary-ink:${tinta};`,
    `--ring:${tinta};`,
    `--accent:${suave};`,
    `--accent-foreground:${suaveTexto};`,
    `--chart-1:${tinta};`,
    `--chart-3:${claro};`,
    `--sidebar:${sidebar};`,
    `--sidebar-foreground:${sidebarTexto};`,
    `--sidebar-foreground-muted:${sidebarAtenuado};`,
    `--sidebar-accent:${sidebarHover};`,
    `--sidebar-accent-foreground:${sidebarTexto};`,
    `--sidebar-border:${sidebarBorde};`,
    `--sidebar-primary:${oscura ? claro : tinta};`,
    `--sidebar-ring:${oscura ? claro : tinta};`,
    "}",
  ].join("");
}
