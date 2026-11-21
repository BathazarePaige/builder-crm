import type { NivelEmbudo } from "@/lib/tableau-de-bord/calculs";
import { Carte, Vide } from "./Carte";
import { SERIE_COULEURS } from "./palette";

/**
 * Embudo de conversion dibujado con trapecios SVG: cada nivel se angosta en proporcion
 * fija (la forma es la de un embudo, los numeros van al lado).
 */
export function Entonnoir({ niveaux }: { niveaux: NivelEmbudo[] }) {
  const n = niveaux.length;
  const h = 46;
  const ancho = 140;
  const minimo = 22;
  const anchoDe = (i: number) => ancho - ((ancho - minimo) * i) / Math.max(1, n);

  return (
    <Carte titre="Entonnoir de ventes" sousTitre="Des nouveaux leads aux affaires gagnées.">
      {n <= 1 ? (
        <Vide>Aucune étape de pipeline configurée.</Vide>
      ) : (
        <div className="flex gap-4">
          <svg viewBox={`0 0 ${ancho} ${h * n}`} className="w-[44%] max-w-[150px] shrink-0" style={{ height: h * n }} aria-hidden>
            {niveaux.map((_, i) => {
              const a = anchoDe(i);
              const b = anchoDe(i + 1);
              const y = i * h;
              const pts = [
                [(ancho - a) / 2, y + 1],
                [(ancho + a) / 2, y + 1],
                [(ancho + b) / 2, y + h - 1],
                [(ancho - b) / 2, y + h - 1],
              ];
              return <polygon key={i} points={pts.map((p) => p.join(",")).join(" ")} fill={SERIE_COULEURS[i % SERIE_COULEURS.length]} />;
            })}
          </svg>
          <ul className="flex-1 min-w-0">
            {niveaux.map((niv, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-[12.5px]" style={{ height: h }}>
                <div className="min-w-0 pt-1.5">
                  <p className="truncate font-medium text-foreground">{niv.etiqueta}</p>
                  {niv.tasa !== null && <p className="text-[11px] text-muted-foreground">{niv.tasa.toLocaleString("fr-FR")} %</p>}
                </div>
                <span className="pt-1.5 font-semibold tabular-nums">{niv.cantidad.toLocaleString("fr-FR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Carte>
  );
}
