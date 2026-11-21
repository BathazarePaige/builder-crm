"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Check, Copy, Loader2, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { conexionMetaSchema } from "@/lib/channels/meta-cloud-conexion";
import { ConnexionWhatsapp, type ConfigSignup } from "./whatsapp/ConnexionWhatsapp";

interface CuentaWhatsapp {
  id: string;
  phoneNumberId: string;
  wabaId: string | null;
  displayPhone: string | null;
  status: string;
  tieneToken: boolean;
}

interface EstadoMeta {
  activo: boolean;
  cuentas: CuentaWhatsapp[];
  webhookUrl: string | null;
  tieneAppSecret: boolean;
  tieneVerifyToken: boolean;
  signup: ConfigSignup;
}

type Entrada = z.input<typeof conexionMetaSchema>;
type Salida = z.output<typeof conexionMetaSchema>;

/**
 * WhatsApp direct (Meta Cloud API, sans Zernio). Le chemin normal est l’assistant
 * « Connecter WhatsApp » (fenêtre de Meta, Embedded Signup) ; la saisie manuelle des
 * identifiants reste pour qui les a déjà. Le serveur valide contre Graph avant
 * d’enregistrer et ne renvoie jamais le jeton.
 *
 * Réservé aux admins : si la route répond 403, le bloc ne s’affiche pas.
 */
export function WhatsappDirectoSettings({ onCambio }: { onCambio?: () => void }) {
  const [estado, setEstado] = useState<EstadoMeta | null>(null);
  const [oculto, setOculto] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);
  const [assistant, setAssistant] = useState(false);
  const [manuel, setManuel] = useState(false);

  const form = useForm<Entrada, unknown, Salida>({
    resolver: zodResolver(conexionMetaSchema),
    defaultValues: { phoneNumberId: "", wabaId: "", accessToken: "" },
  });

  const cargar = useCallback(async () => {
    const res = await fetch("/api/channels/meta", { cache: "no-store" }).catch(() => null);
    if (!res || !res.ok) {
      setOculto(true);
      return;
    }
    setEstado(await res.json());
  }, []);

  useEffect(() => {
    // Premier chargement hors du corps synchrone de l’effet (react-hooks/set-state-in-effect).
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const apresConnexion = async () => {
    await cargar();
    onCambio?.();
  };

  const connecterManuel = async (datos: Salida) => {
    const res = await fetch("/api/channels/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "Impossible de connecter le numéro");
      return;
    }
    toast.success(`WhatsApp ${json.cuenta?.displayPhone ?? ""} connecté`.trim(), {
      description: json.avisos?.join(" ") || undefined,
      duration: json.avisos?.length ? 10000 : 4000,
    });
    form.reset();
    setManuel(false);
    await apresConnexion();
  };

  const deconnecter = async (cuenta: CuentaWhatsapp) => {
    if (!confirm(`Déconnecter ${cuenta.displayPhone ?? cuenta.phoneNumberId} ? Le jeton est supprimé et les messages n’arrivent plus.`)) {
      return;
    }
    setQuitando(cuenta.id);
    try {
      const res = await fetch(`/api/channels/meta?id=${cuenta.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Numéro déconnecté");
      await apresConnexion();
    } catch {
      toast.error("Impossible de déconnecter");
    } finally {
      setQuitando(null);
    }
  };

  if (oculto) return null;
  if (!estado) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de WhatsApp direct…
      </div>
    );
  }

  const actives = estado.cuentas.filter((c) => c.status === "active");
  const erreurs = form.formState.errors;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">WhatsApp direct (Meta, sans Zernio)</p>
          <p className="text-[11px] text-muted-foreground">
            Connecte ton numéro directement à Meta : depuis l’app WhatsApp Business (coexistence) ou un numéro neuf.
          </p>
        </div>
        <Button size="sm" onClick={() => setAssistant(true)}>
          <Plug className="h-3.5 w-3.5" />
          {actives.length > 0 ? "Reconnecter" : "Connecter WhatsApp"}
        </Button>
      </div>

      {!estado.activo && (
        <p className="text-[11px] text-amber-700">
          Pour l’instant WhatsApp passe par Zernio. Pour utiliser la connexion directe, l’instance doit avoir
          WHATSAPP_PROVIDER=meta.
        </p>
      )}

      {actives.length > 0 && (
        <ul className="space-y-1">
          {actives.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[12px]">
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium">{c.displayPhone ?? c.phoneNumberId}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                id {c.phoneNumberId}
                {c.wabaId ? ` · waba ${c.wabaId}` : ""}
              </span>
              <Button size="sm" variant="ghost" className="ml-auto h-7" disabled={quitando === c.id} onClick={() => deconnecter(c)}>
                {quitando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                Déconnecter
              </Button>
            </li>
          ))}
        </ul>
      )}

      {manuel && (
        <form onSubmit={form.handleSubmit(connecterManuel)} className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
          <p className="text-[11px] text-muted-foreground sm:col-span-2">
            Saisie manuelle : depuis developers.facebook.com, l’identifiant du numéro, celui du compte WhatsApp Business
            (WABA) et un jeton permanent d’utilisateur système.
          </p>
          <Champ id="wa-phone-id" label="Identifiant du numéro" erreur={erreurs.phoneNumberId?.message}>
            <Input id="wa-phone-id" inputMode="numeric" autoComplete="off" {...form.register("phoneNumberId")} />
          </Champ>
          <Champ id="wa-waba-id" label="Identifiant WABA" erreur={erreurs.wabaId?.message}>
            <Input id="wa-waba-id" inputMode="numeric" autoComplete="off" {...form.register("wabaId")} />
          </Champ>
          <div className="sm:col-span-2">
            <Champ id="wa-token" label="Jeton d’accès" erreur={erreurs.accessToken?.message}>
              <Input id="wa-token" type="password" autoComplete="off" {...form.register("accessToken")} />
            </Champ>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
              Connecter le numéro
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setManuel(false)}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <p>Dans l’app Meta, section Webhooks de WhatsApp, enregistre cette URL et abonne le champ messages :</p>
        {estado.webhookUrl ? (
          <UrlCopiable url={estado.webhookUrl} />
        ) : (
          <p>APP_BASE_URL manque sur l’instance : l’URL est https://ton-domaine/api/webhooks/whatsapp.</p>
        )}
        {!estado.tieneVerifyToken && (
          <p className="text-amber-700">WHATSAPP_WEBHOOK_VERIFY_TOKEN manque : Meta ne pourra pas vérifier le webhook.</p>
        )}
        {!estado.tieneAppSecret && (
          <p className="text-amber-700">WHATSAPP_APP_SECRET manque : le webhook refuse tout tant qu’il n’est pas défini.</p>
        )}
      </div>

      <ConnexionWhatsapp
        open={assistant}
        onOpenChange={setAssistant}
        signup={estado.signup}
        onManuel={() => setManuel(true)}
        onConnecte={apresConnexion}
      />
    </div>
  );
}

function Champ({ id, label, erreur, children }: { id: string; label: string; erreur?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px]">
        {label}
      </Label>
      {children}
      {erreur && <p className="text-[11px] text-destructive">{erreur}</p>}
    </div>
  );
}

function UrlCopiable({ url }: { url: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => toast.success("URL copiée"));
      }}
      className="flex w-full items-center gap-1.5 rounded bg-muted px-2 py-1 text-left font-mono text-[11px] text-foreground"
    >
      <span className="truncate">{url}</span>
      <Copy className="ml-auto h-3 w-3 shrink-0" />
    </button>
  );
}
