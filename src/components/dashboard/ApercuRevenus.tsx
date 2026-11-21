"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/constants";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Carte } from "./Carte";
import { COULEURS } from "./palette";

const MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const MOIS_LONG = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

const VUES = [
  { value: "annee", label: "Cette année" },
  { value: "12m", label: "12 derniers mois" },
];

type Point = { mois: string; libelle: string; real: number | null; prevision: number | null };

function compact(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (v >= 1000) return `${Math.round(v / 1000).toLocaleString("fr-FR")} k`;
  return Math.round(v).toLocaleString("fr-FR");
}

function Bulle({ active, payload }: { active?: boolean; payload?: Array<{ payload: Point }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const prevu = p.real === null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-[11.5px] text-muted-foreground">
        {p.libelle}
        {prevu && " · prévision"}
      </p>
      <p className="text-[15px] font-semibold tabular-nums">{formatCurrency((prevu ? p.prevision : p.real) ?? 0)}</p>
    </div>
  );
}

export function ApercuRevenus({ annee, douze, anneeEnCours }: { annee: DatosTablero["ingresosAnio"]; douze: DatosTablero["ingresos12m"]; anneeEnCours: number }) {
  const [vue, setVue] = useState("annee");
  const donnees: Point[] =
    vue === "annee"
      ? annee.map((p) => ({ mois: MOIS[p.mes], libelle: `${MOIS_LONG[p.mes]} ${anneeEnCours}`, real: p.real, prevision: p.prevision }))
      : douze.map((p) => ({ mois: MOIS[p.mes], libelle: `${MOIS_LONG[p.mes]} ${p.anio}`, real: p.real, prevision: null }));
  const avecPrevision = donnees.some((p) => p.prevision !== null);

  return (
    <Carte
      titre="Évolution du chiffre d’affaires"
      sousTitre="Affaires gagnées par mois."
      action={
        <Select value={vue} items={VUES} onValueChange={(v) => v && setVue(v)}>
          <SelectTrigger className="h-8 w-[150px] cursor-pointer text-[12.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VUES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="-mt-1 mb-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: COULEURS.bleu }} /> Réalisé
        </span>
        {avecPrevision && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COULEURS.orange }} /> Prévision
          </span>
        )}
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 260 }}>
          <AreaChart data={donnees} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-reel" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COULEURS.bleu} stopOpacity={0.2} />
                <stop offset="100%" stopColor={COULEURS.bleu} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-prev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COULEURS.orange} stopOpacity={0.16} />
                <stop offset="100%" stopColor={COULEURS.orange} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#EEF0F4" strokeDasharray="3 3" />
            <XAxis dataKey="mois" tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8A8FA3" }} dy={6} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11.5, fill: "#8A8FA3" }} tickFormatter={compact} width={52} />
            <Tooltip content={<Bulle />} cursor={{ stroke: "#CBD2E1", strokeDasharray: "3 3" }} />
            <Area
              type="monotone"
              dataKey="real"
              stroke={COULEURS.bleu}
              strokeWidth={2}
              fill="url(#grad-reel)"
              connectNulls={false}
              dot={{ r: 3, fill: COULEURS.bleu, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
            />
            {avecPrevision && (
              <Area
                type="monotone"
                dataKey="prevision"
                stroke={COULEURS.orange}
                strokeWidth={2}
                strokeDasharray="5 5"
                fill="url(#grad-prev)"
                connectNulls={false}
                dot={false}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Carte>
  );
}
