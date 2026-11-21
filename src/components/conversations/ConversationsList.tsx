"use client";

import Link from "next/link";
import { AlertCircle, Bot, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { ConversationListItem } from "@/lib/conversations";
import { cn } from "@/lib/utils";
import { avatarBg, getInitials } from "@/lib/avatar";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import type { Channel } from "@/lib/channels/types";
import { CHANNEL_COLORS, ChannelIcon } from "@/components/icons/channels";
import { ChannelFilter } from "./ChannelFilter";

interface Props {
  conversations: ConversationListItem[];
  selectedId?: string;
}

export function ConversationsList({ conversations, selectedId }: Props) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<Channel | "all">("all");

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of conversations) acc[c.channel] = (acc[c.channel] ?? 0) + 1;
    return acc;
  }, [conversations]);

  const filtered = useMemo(() => {
    const byChannel =
      channel === "all"
        ? conversations
        : conversations.filter((c) => c.channel === channel);

    const q = search.trim().toLowerCase();
    if (!q) return byChannel;
    const digits = q.replace(/\D/g, "");
    return byChannel.filter((c) => {
      if (c.name?.toLowerCase().includes(q)) return true;
      if (c.lastBody?.toLowerCase().includes(q)) return true;
      if (c.handle?.toLowerCase().includes(q)) return true;
      if (digits && c.phone && c.phone.replace(/\D/g, "").includes(digits))
        return true;
      return false;
    });
  }, [conversations, search, channel]);

  return (
    <aside
      className={cn(
        "w-full md:w-[340px] shrink-0 border-r border-border h-full flex-col bg-card",
        // En telefono no hay lugar para lista + chat: con un hilo abierto se ve solo el
        // chat (y el boton de volver en su cabecera). Sin eso, el chat colapsaba a 0 px.
        selectedId ? "hidden md:flex" : "flex"
      )}
    >
      <div className="px-4 pt-4 pb-3 flex items-baseline gap-2">
        <h1 className="text-[15px] font-semibold tracking-tight">
          Boîte de réception
        </h1>
        <span className="ml-auto text-[12px] text-muted-foreground tabular-nums">
          {search && filtered.length !== conversations.length
            ? `${filtered.length} sur ${conversations.length}`
            : `${conversations.length} conversation${conversations.length > 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="px-3 pb-3 bg-card">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, identifiant ou numéro"
            aria-label="Rechercher une conversation"
            className="w-full h-9 pl-8 pr-7 text-[13px] rounded-md border border-input bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Effacer la recherche"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ChannelFilter value={channel} onChange={setChannel} counts={counts} />

      <div className="flex-1 overflow-auto">
        {conversations.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucune conversation pour l’instant.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Dès qu’un client écrit sur WhatsApp, Instagram ou Messenger,
              la conversation apparaît ici.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Aucun résultat pour « {search} »
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Essayez avec un nom, un identifiant ou un numéro.
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((c) => {
              const isActive = selectedId === c.conversationId;
              return (
                <li key={c.conversationId}>
                  <Link
                    href={`/conversations/${c.conversationId}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-l-2",
                      isActive
                        ? "bg-accent border-primary-ink"
                        : "border-transparent hover:bg-muted/70",
                    )}
                  >
                    <div className="relative shrink-0">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-semibold",
                          avatarBg(c.name),
                        )}
                      >
                        {getInitials(c.name)}
                      </div>
                      <span
                        title={c.channel}
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-card bg-card",
                          CHANNEL_COLORS[c.channel],
                        )}
                      >
                        <ChannelIcon channel={c.channel} className="h-2.5 w-2.5" />
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className={cn("text-[13px] truncate flex-1 flex items-center gap-1.5", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>
                          {c.name}
                          {c.provider === "simulador" && (
                            <span
                              title="Conversation simulée : rien ne part vers un vrai canal"
                              className="shrink-0 inline-flex items-center h-4 px-1 rounded bg-muted text-muted-foreground text-[10px] font-medium"
                            >
                              test
                            </span>
                          )}
                          {c.needsHuman && (
                            <span
                              title={
                                c.needsHumanReason
                                  ? `Humain requis : ${c.needsHumanReason}`
                                  : "Humain requis"
                              }
                              className="shrink-0 inline-flex items-center gap-0.5 h-4 px-1 rounded bg-amber-50 text-amber-800 text-[10px] font-medium"
                            >
                              <AlertCircle className="h-2.5 w-2.5" />
                              humain
                            </span>
                          )}
                          {!c.needsHuman && !c.aiEnabled && (
                            <span
                              title="Agent IA en pause pour ce contact"
                              className="shrink-0 inline-flex items-center gap-0.5 h-4 px-1 rounded bg-muted text-muted-foreground text-[10px] font-medium"
                            >
                              <Bot className="h-2.5 w-2.5" />
                              pause
                            </span>
                          )}
                        </span>
                        {c.lastAt && (
                          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                            {formatDistanceToNow(c.lastAt, {
                              addSuffix: false,
                              locale: fr,
                            })
                              .replace("environ ", "")
                              .replace("moins d’une minute", "< 1 min")
                              .replace("moins d'une minute", "< 1 min")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[12.5px] text-muted-foreground truncate flex-1">
                          {c.lastDirection === "out" && <span>Vous : </span>}
                          {c.lastBody ?? "(sans texte)"}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="shrink-0 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
