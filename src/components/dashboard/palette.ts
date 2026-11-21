/**
 * Paleta fija del tablero (independiente del color de marca): cada indicador y cada
 * nivel del embudo tiene su color, como en la referencia de diseno.
 */
export const COULEURS = {
  bleu: "#3B6BF6",
  vert: "#22B573",
  violet: "#8B5CF6",
  orange: "#F59E0B",
  rose: "#F04F6C",
  turquoise: "#2EC4C9",
  indigo: "#6366F1",
} as const;

export const SERIE_COULEURS = [
  COULEURS.bleu,
  COULEURS.vert,
  COULEURS.violet,
  COULEURS.orange,
  COULEURS.rose,
  COULEURS.turquoise,
  COULEURS.indigo,
];
