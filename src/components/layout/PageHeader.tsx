"use client";

import { cn } from "@/lib/utils";
import { Fragment } from "react";

export interface PageTab {
  value: string;
  label: string;
  count?: number;
}

export interface PageStat {
  label: string;
  value: string | number;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  stats?: PageStat[];
  actions?: React.ReactNode;
  tabs?: PageTab[];
  activeTab?: string;
  onTabChange?: (value: string) => void;
  toolbar?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  stats,
  actions,
  tabs,
  activeTab,
  onTabChange,
  toolbar,
}: PageHeaderProps) {
  return (
    <div className="space-y-4 pb-5 border-b border-border mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <h1 className="text-[22px] md:text-2xl font-semibold tracking-[-0.015em] truncate leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              {subtitle}
            </p>
          )}
          {stats && stats.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 pt-1 text-[13px] text-muted-foreground">
              {stats.map((stat, idx) => (
                <Fragment key={stat.label}>
                  {idx > 0 && (
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                  )}
                  <span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {stat.value}
                    </span>{" "}
                    {stat.label}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.value === activeTab;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => onTabChange?.(tab.value)}
                className={cn(
                  "relative flex items-center gap-2 px-3 py-2 text-sm font-medium cursor-pointer whitespace-nowrap",
                  "transition-[color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                {typeof tab.count === "number" && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary-ink"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-ink rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {toolbar && <div>{toolbar}</div>}
    </div>
  );
}
