"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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

const activitySchema = z.object({
  type: z.enum(["call", "email", "meeting", "note", "follow_up"]),
  description: z.string().min(1, "La description est obligatoire"),
  contactId: z.string().min(1, "Le contact est obligatoire"),
  dealId: z.string(),
  scheduledAt: z.string(),
});

type ActivityFormData = z.infer<typeof activitySchema>;

interface ActivityFormProps {
  open: boolean;
  onClose: () => void;
  preselectedContactId?: string;
  preselectedDealId?: string;
}

export function ActivityForm({
  open,
  onClose,
  preselectedContactId,
  preselectedDealId,
}: ActivityFormProps) {
  const router = useRouter();
  const [contactsList, setContacts] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (open && !preselectedContactId) {
      fetch("/api/contacts")
        .then((r) => r.json())
        .then(setContacts);
    }
  }, [open, preselectedContactId]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ActivityFormData>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      type: "note",
      description: "",
      contactId: preselectedContactId || "",
      dealId: preselectedDealId || "",
      scheduledAt: "",
    },
  });

  const onSubmit = async (data: ActivityFormData) => {
    try {
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: data.type,
          description: data.description,
          contactId: data.contactId,
          dealId: data.dealId || null,
          scheduledAt: data.scheduledAt || null,
        }),
      });

      if (!res.ok) throw new Error("Impossible de créer l’activité");

      toast.success("Activité enregistrée");
      reset();
      onClose();
      router.refresh();
    } catch {
      toast.error("Impossible d’enregistrer l’activité");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enregistrer une activité</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={watch("type")}
              onValueChange={(v) =>
                v && setValue("type", v as ActivityFormData["type"])
              }
            >
              <SelectTrigger className="cursor-pointer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Appel</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="meeting">Rendez-vous</SelectItem>
                <SelectItem value="note">Note</SelectItem>
                <SelectItem value="follow_up">Relance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activity-desc">Description *</Label>
            <Textarea
              id="activity-desc"
              {...register("description")}
              placeholder="Que s’est-il passé, ou que faut-il faire ?"
              rows={3}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {!preselectedContactId && (
            <div className="space-y-2">
              <Label>Contact *</Label>
              <Select
                value={watch("contactId")}
                onValueChange={(v) => v && setValue("contactId", v)}
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Choisir un contact" />
                </SelectTrigger>
                <SelectContent>
                  {contactsList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.contactId && (
                <p className="text-xs text-destructive">
                  {errors.contactId.message}
                </p>
              )}
            </div>
          )}

          {watch("type") === "follow_up" && (
            <div className="space-y-2">
              <Label>Date prévue</Label>
              <Input type="datetime-local" {...register("scheduledAt")} />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="cursor-pointer"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="cursor-pointer"
            >
              {isSubmitting ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
