"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  extractVariables,
  variablesAreSequential,
  renderTemplateBody,
} from "@/lib/whatsapp-templates";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "es", label: "Espagnol" },
  { code: "es_AR", label: "Espagnol (Argentine)" },
  { code: "es_MX", label: "Espagnol (Mexique)" },
  { code: "en_US", label: "Anglais (États-Unis)" },
];

export function CreateTemplateDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [language, setLanguage] = useState("fr");
  const [bodyText, setBodyText] = useState("");
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const vars = useMemo(() => extractVariables(bodyText), [bodyText]);
  const sequential = variablesAreSequential(vars);

  function reset() {
    setName("");
    setCategory("UTILITY");
    setLanguage("fr");
    setBodyText("");
    setExamples([]);
  }

  function close() {
    if (submitting) return;
    reset();
    onClose();
  }

  function addVariable() {
    const next = (vars[vars.length - 1] ?? 0) + 1;
    setBodyText((b) => `${b}{{${next}}}`);
  }

  function setExample(idx: number, value: string) {
    setExamples((prev) => {
      const copy = [...prev];
      copy[idx] = value;
      return copy;
    });
  }

  const preview = renderTemplateBody(
    bodyText,
    vars.map((v) => examples[v - 1] || `exemple ${v}`)
  );

  async function submit() {
    if (submitting) return;
    if (!name.trim() || !bodyText.trim()) {
      toast.error("Le nom et le texte sont obligatoires");
      return;
    }
    if (!sequential) {
      toast.error("Les variables doivent être {{1}}, {{2}}… dans l’ordre, sans trou");
      return;
    }
    if (vars.some((v) => !(examples[v - 1] || "").trim())) {
      toast.error("Donnez un exemple pour chaque variable");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/whatsapp/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          language,
          bodyText,
          examples: vars.map((v) => examples[v - 1] || ""),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error?.message || json.error || "Impossible de créer", {
          description: json.hint,
          duration: 9000,
        });
        return;
      }
      toast.success("Modèle envoyé à Meta pour vérification", {
        description: "Vous pourrez l’envoyer une fois approuvé par Meta.",
      });
      reset();
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau modèle</DialogTitle>
          <DialogDescription>
            Meta le vérifie avant approbation. Seuls les modèles APPROUVÉS peuvent être envoyés.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-name">Nom interne *</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) =>
                setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
              }
              placeholder="recordatorio_visita"
            />
            <p className="text-[11px] text-muted-foreground">
              Minuscules, chiffres et tiret bas uniquement. Le client ne le voit pas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Catégorie *</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTILITY">
                    Utilitaire (suivi, rappel)
                  </SelectItem>
                  <SelectItem value="MARKETING">
                    Marketing (promotion, nouveauté)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Langue *</Label>
              <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tpl-body">Texte du message *</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addVariable}
                className="h-7 cursor-pointer text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Variable
              </Button>
            </div>
            <Textarea
              id="tpl-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder={"Bonjour {{1}}, nous vous rappelons votre visite à {{2}}."}
              rows={4}
            />
            <p className="text-[11px] text-muted-foreground">
              Usa {"{{1}}"}, {"{{2}}"}... para los datos que cambian en cada
              envio.
            </p>
            {!sequential && (
              <p className="text-[11px] text-destructive">
                Las variables deben ir en orden desde {"{{1}}"} sin saltos.
              </p>
            )}
          </div>

          {vars.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <Label className="text-xs">Exemple pour chaque variable *</Label>
              <p className="text-[11px] text-muted-foreground">
                Meta exige un exemple pour vérifier le modèle.
              </p>
              <div className="space-y-2">
                {vars.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <span className="w-10 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
                      {`{{${v}}}`}
                    </span>
                    <Input
                      value={examples[v - 1] || ""}
                      onChange={(e) => setExample(v - 1, e.target.value)}
                      placeholder={v === 1 ? "Juan" : `valeur ${v}`}
                      className="h-8"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {bodyText.trim() && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Aperçu
              </Label>
              <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                {preview}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={submitting}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="cursor-pointer"
            >
              {submitting ? "Envoi…" : "Créer et envoyer pour vérification"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
