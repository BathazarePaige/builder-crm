"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { OwnerSelect } from "./OwnerSelect";
import { CamposPersonalizadosInputs } from "./CamposPersonalizados";
import type { ValoresCampos } from "@/lib/config/campos";

const contactSchema = z.object({
  name: z.string().min(1, "Le nom est obligatoire"),
  email: z.string().email("E-mail invalide").or(z.literal("")),
  phone: z.string(),
  company: z.string(),
  source: z.string(),
  notes: z.string(),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface ContactFormProps {
  open: boolean;
  onClose: () => void;
  initialData?: Partial<ContactFormData> & {
    id?: string;
    tags?: string[];
    ownerId?: string | null;
    customFields?: Record<string, unknown> | null;
  };
}

export function ContactForm({ open, onClose, initialData }: ContactFormProps) {
  const router = useRouter();
  const isEditing = !!initialData?.id;
  const [tags, setTags] = useState<string[]>(initialData?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [camposValores, setCamposValores] = useState<ValoresCampos>(
    (initialData?.customFields as ValoresCampos | null) ?? {}
  );
  // Solo se manda si el admin lo toco: un asesor no puede cambiarlo y el servidor
  // rechaza el campo aunque venga con el mismo valor.
  const [ownerId, setOwnerId] = useState<string | null>(initialData?.ownerId ?? null);
  const [ownerDirty, setOwnerDirty] = useState(false);

  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft("");
      return;
    }
    setTags([...tags, t]);
    setTagDraft("");
  };
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: initialData?.name || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      company: initialData?.company || "",
      source: initialData?.source || "otro",
      notes: initialData?.notes || "",
    },
  });

  const onSubmit = async (data: ContactFormData) => {
    try {
      const url = isEditing
        ? `/api/contacts/${initialData!.id}`
        : "/api/contacts";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          tags,
          customFields: camposValores,
          ...(ownerDirty ? { ownerId } : {}),
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error || "Impossible d’enregistrer");
      }

      toast.success(
        isEditing ? "Contact mis à jour" : "Contact créé"
      );
      reset();
      setTags([]);
      setTagDraft("");
      setCamposValores({});
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossible d’enregistrer le contact");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Modifier le contact" : "Nouveau contact"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom *</Label>
            <Input id="name" {...register("name")} placeholder="Nom complet" />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} placeholder="correo@ejemplo.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" {...register("phone")} placeholder="+52 55 1234 5678" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company">Entreprise</Label>
            <Input id="company" {...register("company")} placeholder="Nom de l’entreprise" />
          </div>

          <div className="space-y-2">
            <Label>Source</Label>
            <Select
              value={watch("source")}
              onValueChange={(v) => v && setValue("source", v)}
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="website">Site web</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="referido">Recommandation</SelectItem>
                <SelectItem value="redes_sociales">Réseaux sociaux</SelectItem>
                <SelectItem value="llamada_fria">Prospection à froid</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="formulario">Formulaire</SelectItem>
                <SelectItem value="evento">Événement</SelectItem>
                <SelectItem value="import">Importé</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="otro">Autre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Étiquettes</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary-ink border border-primary-ink/20 px-2 py-0.5 text-[11px] font-medium"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Retirer ${tag}`}
                    className="hover:text-destructive cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Saisir une étiquette puis Entrée"
                className="h-9"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTag}
                disabled={!tagDraft.trim()}
                className="cursor-pointer h-9"
              >
                Ajouter
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Conseiller responsable</Label>
            <OwnerSelect
              value={ownerId}
              onChange={(v) => {
                setOwnerId(v);
                setOwnerDirty(true);
              }}
            />
          </div>

          <CamposPersonalizadosInputs
            valores={camposValores}
            onChange={setCamposValores}
            disabled={isSubmitting}
          />

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Notes sur le contact…" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting ? "Enregistrement…" : isEditing ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
