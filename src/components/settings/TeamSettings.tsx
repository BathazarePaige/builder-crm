"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, ShieldCheck, UserPlus, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarBg, getInitials } from "@/lib/avatar";
import { leerConfigPublica } from "@/lib/config-publica";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "asesor";
  active: boolean;
}

const ROLE_ITEMS = [
  { value: "admin", label: "Administrateur" },
  { value: "asesor", label: "Conseiller" },
];

const ACCESO_ITEMS = [
  { value: "invitacion", label: "Invitation par e-mail" },
  { value: "clave", label: "Mot de passe temporaire" },
];

type ModoAcceso = "invitacion" | "clave";

function label(m: Member) {
  return m.name?.trim() || m.email.split("@")[0];
}

/**
 * Equipo: quien esta, con que rol, y el alta de asesores. El signup publico esta
 * cerrado: la unica puerta de entrada es esta pantalla.
 */
export function TeamSettings() {
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [list, current] = await Promise.all([
      fetch("/api/team").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/team/me").then((r) => (r.ok ? r.json() : { member: null })),
    ]);
    return { list, me: current.member as Member | null };
  }, []);

  const apply = useCallback((data: { list: Member[]; me: Member | null }) => {
    setMembers(data.list);
    setMe(data.me);
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    load().then((data) => {
      if (alive) apply(data);
    });
    return () => {
      alive = false;
    };
  }, [load, apply]);

  const isAdmin = me?.role === "admin";
  // Si el servidor de autenticacion manda correos, el alta puede invitar; si no, la
  // unica via es una contrasena temporal que el admin pasa a mano.
  const { authEnviaCorreos } = leerConfigPublica();

  const reenviarAcceso = async (m: Member) => {
    const res = await fetch(`/api/team/${m.id}/acceso`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Impossible de renvoyer");
      return;
    }
    toast.success(`Lien envoyé à ${m.email}`);
  };

  const update = async (id: string, patch: Partial<Member>) => {
    const res = await fetch(`/api/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error ?? "Impossible de mettre à jour");
      return;
    }
    toast.success("Équipe mise à jour");
    apply(await load());
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement de l’équipe…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Les <strong>administrateurs</strong> voient tout et attribuent les contacts. Les{" "}
          <strong>conseillers</strong> ne voient que les contacts qui leur sont attribués.
        </p>
        {isAdmin && (
          <Button size="sm" onClick={() => setOpen(true)} className="cursor-pointer shrink-0">
            <UserPlus className="h-4 w-4 mr-1" />
            Ajouter
          </Button>
        )}
      </div>

      <div className="rounded-lg border divide-y">
        {members.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex items-center gap-3 p-3",
              !m.active && "opacity-50"
            )}
          >
            <div
              className={cn(
                "h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold",
                avatarBg(label(m))
              )}
            >
              {getInitials(label(m))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">
                {label(m)}
                {me?.id === m.id && (
                  <span className="text-xs text-muted-foreground font-normal"> (tu)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>

            {isAdmin ? (
              <Select
                value={m.role}
                items={ROLE_ITEMS}
                onValueChange={(v) => v && v !== m.role && update(m.id, { role: v as Member["role"] })}
              >
                <SelectTrigger className="h-8 w-[120px] text-xs cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrateur</SelectItem>
                  <SelectItem value="asesor">Conseiller</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant={m.role === "admin" ? "default" : "outline"} className="text-xs">
                {m.role === "admin" ? (
                  <>
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Admin
                  </>
                ) : (
                  "Conseiller"
                )}
              </Badge>
            )}

            {isAdmin && authEnviaCorreos && m.active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => reenviarAcceso(m)}
                className="cursor-pointer h-8 px-2"
                title="Renvoyer l’accès par e-mail"
              >
                <Mail className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}

            {isAdmin && me?.id !== m.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update(m.id, { active: !m.active })}
                className="cursor-pointer h-8 px-2"
                title={m.active ? "Désactiver" : "Réactiver"}
              >
                {m.active ? (
                  <UserX className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <UserCheck className="h-4 w-4 text-primary-ink" />
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <AddMemberDialog
          open={open}
          onClose={() => setOpen(false)}
          onCreated={async () => apply(await load())}
          puedeInvitar={authEnviaCorreos}
        />
      )}
    </div>
  );
}

function CampoClaveTemporal({
  password,
  onChange,
}: {
  password: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="tm-pass">Mot de passe temporaire</Label>
      <Input
        id="tm-pass"
        type="text"
        value={password}
        onChange={(e) => onChange(e.target.value)}
        placeholder="facultatif, 8 caractères min."
        autoComplete="off"
      />
      <p className="text-xs text-muted-foreground">
        Laissez vide si la personne se connecte avec Google ou un autre fournisseur.
      </p>
    </div>
  );
}

function AddMemberDialog({
  open,
  onClose,
  onCreated,
  puedeInvitar,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  puedeInvitar: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Member["role"]>("asesor");
  const [modo, setModo] = useState<ModoAcceso>("invitacion");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const invitar = puedeInvitar && modo === "invitacion";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role, password, invitar }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Impossible d’ajouter");
        return;
      }
      if (body.avisoCorreo) {
        toast.warning(`Ajouté, mais l’e-mail n’est pas parti : ${body.avisoCorreo}`);
      } else if (body.correoEnviado) {
        toast.success(`Invité. Un e-mail a été envoyé à ${email} pour choisir son mot de passe.`);
      } else {
        toast.success(
          body.reusedAuthUser
            ? "Ajouté. La personne avait déjà un compte : elle se connecte avec son mot de passe habituel."
            : "Ajouté. Transmettez-lui l’e-mail et le mot de passe temporaire."
        );
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("asesor");
      setModo("invitacion");
      onClose();
      await onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter à l’équipe</DialogTitle>
          <DialogDescription>
            {invitar
              ? "La personne reçoit un e-mail avec un lien pour choisir son mot de passe. Rien d’autre à lui transmettre."
              : "Le compte est prêt tout de suite, sans e-mail : transmettez vous-même le mot de passe temporaire, ou laissez-le vide pour une connexion via un fournisseur externe."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tm-name">Nom</Label>
            <Input
              id="tm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom utilisé par l’agent"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-email">E-mail *</Label>
            <Input
              id="tm-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor@empresa.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={role} items={ROLE_ITEMS} onValueChange={(v) => v && setRole(v as Member["role"])}>
                <SelectTrigger className="cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asesor">Conseiller</SelectItem>
                  <SelectItem value="admin">Administrateur</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === "asesor"
                  ? "Voit seulement ses contacts attribués, avec leurs conversations, affaires et activités."
                  : "Voit tout et gère l’équipe, les canaux, l’agent et les automatisations."}
              </p>
            </div>
            {puedeInvitar ? (
              <div className="space-y-2">
                <Label>Mode de connexion</Label>
                <Select
                  value={modo}
                  items={ACCESO_ITEMS}
                  onValueChange={(v) => v && setModo(v as ModoAcceso)}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invitacion">Invitation par e-mail</SelectItem>
                    <SelectItem value="clave">Mot de passe temporaire</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {invitar
                    ? "Reçoit le lien à cet e-mail et choisit son mot de passe."
                    : "Vous le transmettez vous-même."}
                </p>
              </div>
            ) : (
              <CampoClaveTemporal password={password} onChange={setPassword} />
            )}
          </div>

          {puedeInvitar && !invitar && (
            <CampoClaveTemporal password={password} onChange={setPassword} />
          )}

          {!invitar && (
            <p className="text-xs text-muted-foreground">
              Le compte est créé avec ce mot de passe. Si l’e-mail a déjà un compte, il est réutilisé et le mot de passe est ignoré.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} className="cursor-pointer">
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="cursor-pointer">
              {saving ? "Enregistrement…" : invitar ? "Inviter" : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
