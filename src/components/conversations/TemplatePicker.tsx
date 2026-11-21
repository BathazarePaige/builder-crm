"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  getBodyText,
  extractVariables,
  renderTemplateBody,
  buildSendComponents,
} from "@/lib/whatsapp-templates";

interface Template {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactPhone: string;
  onSent: () => void;
}

export function TemplatePicker({
  open,
  onClose,
  contactId,
  contactPhone,
  onSent,
}: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [values, setValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        cache: "no-store",
      });
      const json = await res.json();
      const approved: Template[] = (json.templates || []).filter(
        (t: Template) => t.status?.toUpperCase() === "APPROVED"
      );
      setTemplates(approved);
    } catch {
      toast.error("Impossible de charger les modèles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSelected(null);
      setValues([]);
      load();
    }
  }, [open, load]);

  const bodyText = useMemo(
    () => (selected ? getBodyText(selected.components) : ""),
    [selected]
  );
  const vars = useMemo(() => extractVariables(bodyText), [bodyText]);
  const preview = renderTemplateBody(
    bodyText,
    vars.map((v) => values[v - 1] || `{{${v}}}`)
  );
  const allFilled = vars.every((v) => (values[v - 1] || "").trim());

  function setValue(idx: number, value: string) {
    setValues((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  }

  async function send() {
    if (!selected || sending) return;
    if (!allFilled) {
      toast.error("Remplissez toutes les variables");
      return;
    }
    setSending(true);
    try {
      const components = buildSendComponents(
        bodyText,
        vars.map((v) => values[v - 1] || "")
      );
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: contactPhone,
          contactId,
          template: {
            name: selected.name,
            language: selected.language,
            components,
            previewText: renderTemplateBody(
              bodyText,
              vars.map((v) => values[v - 1] || "")
            ),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || `HTTP ${res.status}`, {
          description: json.hint,
          duration: 9000,
        });
        return;
      }
      toast.success("Modèle envoyé", { duration: 2000 });
      onSent();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="cursor-pointer text-muted-foreground hover:text-foreground"
                aria-label="Retour"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            {selected ? "Compléter le modèle" : "Envoyer un modèle"}
          </DialogTitle>
          {!selected && (
            <DialogDescription>
              Seuls les modèles approuvés par Meta apparaissent.
            </DialogDescription>
          )}
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-muted rounded-lg animate-pulse"
                />
              ))
            ) : templates.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Aucun modèle approuvé pour l’instant.
                </p>
                <a
                  href="/plantillas"
                  className="mt-1 inline-block text-xs text-primary-ink hover:underline"
                >
                  Créer un modèle
                </a>
              </div>
            ) : (
              templates.map((t) => {
                const preview = getBodyText(t.components);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelected(t);
                      setValues([]);
                    }}
                    className="w-full text-left rounded-lg border border-border/60 bg-card p-3 hover:bg-muted/40 hover:border-primary-ink/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium font-mono truncate">
                        {t.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                        {t.language}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {preview}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {vars.length > 0 ? (
              <div className="space-y-2">
                {vars.map((v) => (
                  <div key={v} className="space-y-1">
                    <Label className="text-xs font-mono text-muted-foreground">
                      {`{{${v}}}`}
                    </Label>
                    <Input
                      value={values[v - 1] || ""}
                      onChange={(e) => setValue(v - 1, e.target.value)}
                      placeholder={`Valeur ${v}`}
                      className="h-9"
                      autoFocus={v === 1}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Ce modèle n’a pas de variable à remplir.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Aperçu
              </Label>
              <div className="rounded-xl border border-border bg-card px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                {preview}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={sending}
                className="cursor-pointer"
              >
                Retour
              </Button>
              <Button
                type="button"
                onClick={send}
                disabled={sending || !allFilled}
                className="cursor-pointer"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
