"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CHANNELS, CHANNEL_LABELS, type Channel } from "@/lib/channels/types";
import { CHANNEL_COLORS, ChannelIcon } from "@/components/icons/channels";

interface ChannelAccount {
  id: string;
  platform: Channel;
  provider: string;
  username: string | null;
  displayName: string | null;
  status: string;
  zernioAccountId: string | null;
}

interface EstadoConector {
  id: string;
  nombre: string;
  configurado: boolean;
  faltan: string[];
  cuentas: Array<{ id: string; canal: Channel; nombre: string; estado: string }>;
  notas: string[];
}

interface ChannelsPayload {
  accounts: ChannelAccount[];
  conectores: EstadoConector[];
  config: {
    hasApiKey: boolean;
    hasWebhookSecret: boolean;
    profileId: string | null;
    whatsappProvider: string;
  };
}

export function ChannelsSettings() {
  const [data, setData] = useState<ChannelsPayload | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState<Channel | null>(null);
  const [importing, setImporting] = useState(false);
  // Como conectar WhatsApp. Coexistencia por defecto: es lo que quiere un negocio que
  // ya atiende desde el celular. Ver la nota en la UI mas abajo.
  const [waMode, setWaMode] = useState<"business_app" | "api">("business_app");
  const popupRef = useRef<Window | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      setData(await res.json());
    } catch {
      toast.error("Impossible de charger les canaux");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // El popup avisa por postMessage cuando termina el OAuth y se cierra solo.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as
        | { source?: string; ok?: boolean; platform?: string; error?: string }
        | null;
      if (data?.source !== "zernio-connect") return;

      setConnecting(null);
      popupRef.current = null;

      if (data.ok) {
        const label = CHANNELS.includes(data.platform as Channel)
          ? CHANNEL_LABELS[data.platform as Channel]
          : "Le compte";
        toast.success(`${label} connecté`);
        load();
      } else {
        toast.error(data.error ?? "Impossible de connecter le compte");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [load]);

  // Si el usuario cierra el popup a mano no llega ningun mensaje: sin esto el boton
  // quedaria girando para siempre.
  useEffect(() => {
    if (!connecting) return;
    const timer = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(timer);
        popupRef.current = null;
        setConnecting(null);
        load();
      }
    }, 800);
    return () => clearInterval(timer);
  }, [connecting, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/channels/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "sync_failed");
      toast.success(
        `Sincronizadas ${json.synced} cuentas${json.skipped ? ` (${json.skipped} de otras plataformas, ignoradas)` : ""}`
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur de synchronisation");
    } finally {
      setSyncing(false);
    }
  };

  const importHistory = async () => {
    if (
      !confirm(
        "Importer l’historique déjà répliqué par Zernio (jusqu’à 500 conversations par compte) ?\n\n" +
          "L’agent ne se déclenche PAS : aucun ancien client ne recevra de réponse."
      )
    ) {
      return;
    }
    setImporting(true);
    toast.message("Import de l’historique…", { id: "backfill" });
    try {
      const res = await fetch("/api/channels/backfill", { method: "POST" });
      const json = await res.json();

      if (!json.ok && json.conversations === 0) {
        toast.error(json.errors?.[0] ?? "Impossible d’importer l’historique", {
          id: "backfill",
          duration: 8000,
        });
        return;
      }

      toast.success(
        `${json.conversations} conversations et ${json.messages} messages importés`,
        {
          id: "backfill",
          description: json.incomplete
            ? "Des fils restent à importer : cliquez à nouveau pour continuer."
            : json.errors?.length
              ? `Avec avertissements : ${json.errors[0]}`
              : undefined,
          duration: 8000,
        }
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur d’import", {
        id: "backfill",
      });
    } finally {
      setImporting(false);
    }
  };

  const connect = async (platform: Channel) => {
    // La ventana se abre ANTES del await, de forma sincronica con el click: si se
    // abriera al resolver la promesa, el navegador la trata como popup no solicitado
    // y la bloquea.
    const popup = window.open(
      "about:blank",
      "zernio-connect",
      "width=620,height=780,menubar=no,toolbar=no"
    );
    if (!popup) {
      toast.error("Le navigateur a bloqué la fenêtre", {
        description: "Autorisez les fenêtres pop-up pour ce site et réessayez.",
      });
      return;
    }

    popupRef.current = popup;
    setConnecting(platform);

    const query =
      platform === "whatsapp"
        ? `platform=whatsapp&onboarding=${waMode}`
        : `platform=${platform}`;

    try {
      const res = await fetch(`/api/channels/connect?${query}`);
      const json = await res.json();
      if (!res.ok || !json.authUrl) throw new Error(json.error ?? "connect_failed");
      popup.location.href = json.authUrl;
    } catch (err) {
      popup.close();
      popupRef.current = null;
      setConnecting(null);
      toast.error(err instanceof Error ? err.message : "Erreur de connexion");
    }
  };

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des canaux…
      </div>
    );
  }

  const { config } = data;

  return (
    <div className="space-y-4">
      {!config.hasApiKey && (
        <Warning>
          Il manque <code className="bg-muted px-1 rounded">ZERNIO_API_KEY</code> dans les variables de l’instance (dans Coolify, Environment Variables ; en développement,{" "}
          <code className="bg-muted px-1 rounded">.env.local</code>). Sans elle, impossible de lister ou connecter des comptes. Redéployez pour prendre en compte la nouvelle valeur.
        </Warning>
      )}
      {!config.hasWebhookSecret && (
        <Warning>
          Il manque <code className="bg-muted px-1 rounded">ZERNIO_WEBHOOK_SECRET</code> dans les variables de l’instance. Le webhook refuse tout tant qu’il n’est pas configuré, donc aucun message n’entrera. Il doit être identique à celui de l’abonnement Zernio :{" "}
          <code className="bg-muted px-1 rounded">npm run zernio:webhook</code> les aligne.
        </Warning>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Connecteurs
        </p>
        {(data.conectores ?? []).map((c) => (
          <div
            key={c.id}
            className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
          >
            <span
              className={cn(
                "mt-1 h-2 w-2 shrink-0 rounded-full",
                c.configurado ? "bg-emerald-500" : "bg-amber-500"
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-medium">{c.nombre}</span>{" "}
                <span className="text-[11px] text-muted-foreground">
                  {c.configurado
                    ? `${c.cuentas.length} compte${c.cuentas.length === 1 ? "" : "s"}`
                    : `il manque ${c.faltan.join(", ")}`}
                </span>
              </p>
              {c.notas.map((n, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">
                  {n}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {CHANNELS.map((channel) => {
          const accounts = data.accounts.filter((a) => a.platform === channel);
          const isWhatsappOnMeta =
            channel === "whatsapp" && config.whatsappProvider !== "zernio";

          return (
            <div
              key={channel}
              className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/60",
                  CHANNEL_COLORS[channel]
                )}
              >
                <ChannelIcon channel={channel} className="h-3.5 w-3.5" />
              </span>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{CHANNEL_LABELS[channel]}</p>
                {accounts.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Aucun compte connecté.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {accounts.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                      >
                        <StatusDot status={a.status} />
                        <span className="truncate">
                          {a.username ?? a.displayName ?? a.zernioAccountId}
                        </span>
                        <span className="font-mono opacity-60">
                          via {a.provider}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isWhatsappOnMeta ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Mode secours : WhatsApp passe directement par Meta Cloud API
                    (<code className="bg-muted px-1 rounded">WHATSAPP_PROVIDER=meta</code>).
                  </p>
                ) : (
                  channel === "whatsapp" &&
                  accounts.length === 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        <WaModeButton
                          active={waMode === "business_app"}
                          onClick={() => setWaMode("business_app")}
                          label="Coexistence"
                        />
                        <WaModeButton
                          active={waMode === "api"}
                          onClick={() => setWaMode("api")}
                          label="Cloud API seulement"
                        />
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {waMode === "business_app" ? (
                          <>
                            Le numéro continue de fonctionner dans l’app WhatsApp Business du téléphone, et les réponses envoyées depuis l’app sont aussi enregistrées dans le CRM. C’est le bon choix si l’entreprise répond déjà avec ce numéro.
                          </>
                        ) : (
                          <>
                            Le numéro passe uniquement sur Cloud API et ne fonctionne plus sur le téléphone. Choisissez ceci seulement si le numéro était déjà sur Cloud API. Un numéro présent dans l’app WhatsApp Business apparaît comme <em>non conforme</em> dans ce mode.
                          </>
                        )}
                      </p>
                    </div>
                  )
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                disabled={!config.hasApiKey || connecting !== null}
                onClick={() => connect(channel)}
              >
                {connecting === channel ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plug className="h-3.5 w-3.5" />
                )}
                {accounts.length > 0 ? "Reconnecter" : "Connecter"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={sync}
            disabled={syncing || !config.hasApiKey}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sincronizar cuentas
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={importHistory}
            disabled={importing || !config.hasApiKey || data.accounts.length === 0}
          >
            {importing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Importer l’historique
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Synchroniser récupère les comptes connectés. Importer l’historique récupère les conversations déjà répliquées par Zernio à la connexion de chaque compte : elles n’arrivent pas par webhook et ne déclenchent pas l’agent.
        </p>
      </div>
    </div>
  );
}

function WaModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        active
          ? "border-primary-ink bg-primary/10 text-primary-ink font-medium"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const ok = status === "active";
  return (
    <span
      title={status}
      className={cn(
        "inline-flex h-3 w-3 items-center justify-center rounded-full",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
      )}
    >
      {ok ? <Check className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
    </span>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}
