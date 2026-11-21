"use client";

import { cn } from "@/lib/utils";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/channels/types";
import { CHANNEL_COLORS, ChannelIcon } from "@/components/icons/channels";

interface Props {
  value: Channel | "all";
  onChange: (value: Channel | "all") => void;
  counts: Record<string, number>;
}

export function ChannelFilter({ value, onChange, counts }: Props) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div role="group" aria-label="Filtrer par canal" className="flex items-center gap-1.5 px-3 pb-3 border-b border-border bg-card overflow-x-auto">
      <Pill
        active={value === "all"}
        onClick={() => onChange("all")}
        label="Toutes"
        count={total}
      />
      {CHANNELS.map((channel) => (
        <Pill
          key={channel}
          active={value === channel}
          onClick={() => onChange(channel)}
          label={CHANNEL_LABELS[channel]}
          count={counts[channel] ?? 0}
          icon={
            <ChannelIcon
              channel={channel}
              className={cn("h-3 w-3", value === channel ? "" : CHANNEL_COLORS[channel])}
            />
          }
        />
      ))}
    </div>
  );
}

function Pill({
  active,
  onClick,
  label,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] font-medium transition-colors cursor-pointer",
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-card text-muted-foreground border-border hover:text-foreground hover:bg-muted"
      )}
    >
      {icon}
      {label}
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
