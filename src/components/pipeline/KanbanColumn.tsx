"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { DealCard } from "./DealCard";
import { formatCurrency } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface Deal {
  id: string;
  title: string;
  value: number;
  contactName: string | null;
  probability: number;
  docCount?: number;
}

interface KanbanColumnProps {
  id: string;
  name: string;
  color: string;
  deals: Deal[];
}

export function KanbanColumn({ id, name, color, deals }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-68 shrink-0 rounded-xl bg-muted/60 transition-colors",
        isOver && "bg-accent ring-1 ring-primary-ink/30",
      )}
    >
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 pt-3 pb-1">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <h3 className="text-[13px] font-semibold tracking-tight flex-1 truncate">
          {name}
        </h3>
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {deals.length}
        </span>
      </div>

      <div className="px-3 pb-2">
        <p className="text-[12px] text-muted-foreground tabular-nums">
          {formatCurrency(totalValue)}
        </p>
      </div>

      <SortableContext
        items={deals.map((d) => d.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 px-2 pb-2 space-y-2 min-h-[200px] max-h-[calc(100vh-260px)] overflow-y-auto">
          {deals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-[12px] text-muted-foreground">
              Aucune affaire à cette étape
            </div>
          ) : (
            deals.map((deal) => <DealCard key={deal.id} {...deal} />)
          )}
        </div>
      </SortableContext>
    </div>
  );
}
