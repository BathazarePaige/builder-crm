import { useId } from "react";

/** Curva chica con relleno degradado, en SVG puro (sin recharts: son cuatro por pagina). */
export function Sparkline({ serie, couleur, className }: { serie: number[]; couleur: string; className?: string }) {
  const id = useId();
  const w = 200;
  const h = 48;
  const puntos = serie.length > 1 ? serie : [0, ...serie, 0].slice(0, 2);
  const max = Math.max(...puntos);
  const min = Math.min(...puntos);
  const rango = max - min || 1;
  const coords = puntos.map((v, i) => {
    const x = (i / (puntos.length - 1)) * w;
    const y = h - 4 - ((v - min) / rango) * (h - 10);
    return [x, max === min ? h / 2 : y] as const;
  });
  const linea = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${linea} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={couleur} stopOpacity={0.22} />
          <stop offset="100%" stopColor={couleur} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={linea} fill="none" stroke={couleur} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
