"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, DollarSign, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { LineChart, Line } from "recharts";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { DashboardStats } from "@/types";

interface KPICardsProps {
  stats: DashboardStats;
  /** Contactos nuevos: serie diaria real de los ultimos 7 dias y comparacion con los 7 anteriores. */
  contactos?: { serie: number[]; actual: number; anterior: number };
}

interface KPI {
  title: string;
  value: string;
  icon: typeof Users;
  /** Solo cuando hay una comparacion real; nunca un numero inventado. */
  delta?: { pct: number | null; label: string };
  sparkline?: number[];
}

export function KPICards({ stats, contactos }: KPICardsProps) {
  const deltaContactos =
    contactos && contactos.anterior > 0
      ? Math.round(((contactos.actual - contactos.anterior) / contactos.anterior) * 100)
      : null;

  const cards: KPI[] = [
    {
      title: "Contacts",
      value: stats.totalContacts.toLocaleString("fr-FR"),
      icon: Users,
      delta: contactos
        ? { pct: deltaContactos, label: `${contactos.actual} nouveaux en 7 jours` }
        : undefined,
      sparkline: contactos?.serie,
    },
    {
      title: "Affaires en cours",
      value: stats.activeDeals.toLocaleString("fr-FR"),
      icon: Briefcase,
    },
    {
      title: "Valeur du pipeline",
      value: formatCurrency(stats.totalPipelineValue),
      icon: DollarSign,
    },
    {
      title: "Taux de conversion",
      value: `${stats.conversionRate}%`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const pct = card.delta?.pct ?? null;
        const isPositive = (pct ?? 0) >= 0;
        const DeltaArrow = isPositive ? ArrowUpRight : ArrowDownRight;
        return (
          <Card
            key={card.title}
            className="surface-card relative overflow-hidden gap-3"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 relative">
              <CardTitle className="text-[13px] font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon aria-hidden className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="relative">
              <div className="flex items-end justify-between gap-3">
                <div className="space-y-1.5 min-w-0">
                  <div className="text-[28px] leading-none font-semibold tracking-tight tabular-nums truncate">
                    {card.value}
                  </div>
                  {card.delta && (
                    <div className="inline-flex items-center gap-0.5 text-[11.5px] font-medium">
                      {pct !== null && (
                        <span className={cn("inline-flex items-center gap-0.5", isPositive ? "text-emerald-600" : "text-rose-600")}>
                          <DeltaArrow className="h-3 w-3" />
                          {Math.abs(pct)}%
                        </span>
                      )}
                      <span className="text-muted-foreground font-normal ml-0.5">{card.delta.label}</span>
                    </div>
                  )}
                </div>
                {card.sparkline && card.sparkline.some((v) => v > 0) && (
                  <div className="shrink-0 opacity-80" aria-hidden>
                    <LineChart
                      width={80}
                      height={28}
                      data={card.sparkline.map((v, i) => ({ i, v }))}
                      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
                    >
                      <Line type="monotone" dataKey="v" stroke="var(--primary-ink)" strokeWidth={1.75} dot={false} />
                    </LineChart>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
