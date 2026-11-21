"use client";

import { useState, useRef, KeyboardEvent, FormEvent } from "react";
import { Send, Loader2, FileText, Clock } from "lucide-react";
import { toast } from "sonner";
import { TemplatePicker } from "./TemplatePicker";
import {
  capabilitiesFor,
  isOutsideFreeFormWindow,
  type Channel,
} from "@/lib/channels/types";

interface Props {
  conversationId: string;
  channel: Channel;
  contactId: string;
  contactPhone: string;
  /** Fecha del ultimo mensaje entrante del cliente (para la ventana de 24h). */
  lastInboundAt?: Date | string | null;
}

function notifyRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("conversations:refresh"));
  }
}

export function ChatInput({
  conversationId,
  channel,
  contactId,
  contactPhone,
  lastInboundAt,
}: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const caps = capabilitiesFor(channel);
  const outsideWindow = isOutsideFreeFormWindow(channel, lastInboundAt);

  async function doSend() {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    toast.message("Envoi…", { id: "sending-msg" });
    try {
      // Endpoint generico por conversacion: el servidor resuelve el canal, el proveedor
      // y (en IG/Messenger) si hace falta la etiqueta HUMAN_AGENT.
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text: body }),
      });
      const json = await res.json();

      if (!res.ok || !json.success) {
        toast.error(json.error || `HTTP ${res.status}`, {
          id: "sending-msg",
          description: json.hint,
          duration: 10000,
        });
        notifyRefresh();
        return;
      }

      toast.success("Envoyé", { id: "sending-msg", duration: 2000 });
      setText("");
      notifyRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur réseau", {
        id: "sending-msg",
        duration: 10000,
      });
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doSend();
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-card px-3 md:px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {outsideWindow && (
        <div className="max-w-2xl mx-auto mb-2 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {lastInboundAt
              ? "Plus de 24 h depuis le dernier message du client."
              : "Le client n’a pas encore écrit."}{" "}
            {caps.templates
              ? "Hors de cette fenêtre, WhatsApp n’accepte que des modèles approuvés."
              : "Le message part avec l’étiquette HUMAN_AGENT, autorisée par Meta jusqu’à 7 jours."}
          </span>
          {caps.templates && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-950 cursor-pointer"
            >
              Utiliser un modèle
            </button>
          )}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="max-w-2xl mx-auto flex items-end gap-2.5"
      >
        {/* Las plantillas son un concepto exclusivo de WhatsApp. */}
        {caps.templates && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            disabled={sending}
            className="shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-50 cursor-pointer transition-colors"
            aria-label="Envoyer un modèle"
            title="Envoyer un modèle"
          >
            <FileText className="h-4.5 w-4.5" />
          </button>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Écrire un message…"
          aria-label="Message"
          rows={1}
          className="flex-1 resize-none min-h-[40px] max-h-32 bg-card border border-input rounded-lg px-3.5 py-2.5 text-base md:text-[13.5px] outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/15 transition-colors"
          style={{ fieldSizing: "content" } as React.CSSProperties}
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending}
          className="shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-colors"
          aria-label="Envoyer le message"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>

      {caps.templates && (
        <TemplatePicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          contactId={contactId}
          contactPhone={contactPhone}
          onSent={notifyRefresh}
        />
      )}
    </div>
  );
}
