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
}

type Entrada = z.input<typeof conexionMetaSchema>;
type Salida = z.output<typeof conexionMetaSchema>;

/**
 * Conectar un numero de WhatsApp por Meta Cloud API directo: pegar el phone_number_id,
 * el WABA id y un token de usuario de sistema. El servidor valida contra Graph antes de
 * guardar, suscribe la app al WABA y nunca devuelve el token.
 *
 * Solo lo ve un admin: si la ruta responde 403, el bloque no se muestra.
 */
export function WhatsappDirectoSettings({ onCambio }: { onCambio?: () => void }) {
  const [estado, setEstado] = useState<EstadoMeta | null>(null);
  const [oculto, setOculto] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);

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
    // Primer fetch fuera del cuerpo sincronico del efecto (react-hooks/set-state-in-effect).
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  const conectar = async (datos: Salida) => {
    const res = await fetch("/api/channels/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? "No se pudo conectar el numero");
      return;
    }
    toast.success(`WhatsApp ${json.cuenta?.displayPhone ?? ""} conectado`.trim(), {
      description: json.avisos?.join(" ") || undefined,
      duration: json.avisos?.length ? 10000 : 4000,
    });
    form.reset();
    await cargar();
    onCambio?.();
  };

  const desconectar = async (cuenta: CuentaWhatsapp) => {
    if (!confirm(`Desconectar ${cuenta.displayPhone ?? cuenta.phoneNumberId}? Se borra el token y dejan de entrar mensajes.`)) {
      return;
    }
    setQuitando(cuenta.id);
    try {
      const res = await fetch(`/api/channels/meta?id=${cuenta.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Numero desconectado");
      await cargar();
      onCambio?.();
    } catch {
      toast.error("No se pudo desconectar");
    } finally {
      setQuitando(null);
    }
  };

  if (oculto) return null;
  if (!estado) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando WhatsApp directo...
      </div>
    );
  }

  const activas = estado.cuentas.filter((c) => c.status === "active");
  const errores = form.formState.errors;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card px-3 py-3">
      <div>
        <p className="text-sm font-medium">WhatsApp directo (Meta Cloud API)</p>
        <p className="text-[11px] text-muted-foreground">
          Pega los datos de tu app en developers.facebook.com: el id del numero, el id de la
          cuenta de WhatsApp Business (WABA) y un token permanente de usuario de sistema.
        </p>
      </div>

      {activas.length > 0 && (
        <ul className="space-y-1">
          {activas.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-[12px]">
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium">{c.displayPhone ?? c.phoneNumberId}</span>
              <span className="font-mono text-[11px] text-muted-foreground truncate">
                id {c.phoneNumberId}
                {c.wabaId ? ` · waba ${c.wabaId}` : ""}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7"
                disabled={quitando === c.id}
                onClick={() => desconectar(c)}
              >
                {quitando === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                Desconectar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={form.handleSubmit(conectar)} className="grid gap-2 sm:grid-cols-2">
        <Campo id="wa-phone-id" label="Phone number ID" error={errores.phoneNumberId?.message}>
          <Input id="wa-phone-id" inputMode="numeric" autoComplete="off" {...form.register("phoneNumberId")} />
        </Campo>
        <Campo id="wa-waba-id" label="WABA ID" error={errores.wabaId?.message}>
          <Input id="wa-waba-id" inputMode="numeric" autoComplete="off" {...form.register("wabaId")} />
        </Campo>
        <div className="sm:col-span-2">
          <Campo id="wa-token" label="Token de acceso" error={errores.accessToken?.message}>
            <Input id="wa-token" type="password" autoComplete="off" {...form.register("accessToken")} />
          </Campo>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
            {activas.length > 0 ? "Conectar otro numero" : "Conectar numero"}
          </Button>
        </div>
      </form>

      <div className="space-y-1 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <p>En la app de Meta, Webhooks de WhatsApp, registra esta URL y suscribe el campo messages:</p>
        {estado.webhookUrl ? (
          <UrlCopiable url={estado.webhookUrl} />
        ) : (
          <p>Falta APP_BASE_URL en la instancia: la URL es https://tu-dominio/api/webhooks/whatsapp.</p>
        )}
        {!estado.tieneVerifyToken && (
          <p className="text-amber-700 dark:text-amber-400">
            Falta WHATSAPP_WEBHOOK_VERIFY_TOKEN: Meta no va a poder verificar el webhook.
          </p>
        )}
        {!estado.tieneAppSecret && (
          <p className="text-amber-700 dark:text-amber-400">
            Falta WHATSAPP_APP_SECRET: el webhook rechaza todo hasta que este (fail-closed).
          </p>
        )}
      </div>
    </div>
  );
}

function Campo({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[11px]">
        {label}
      </Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function UrlCopiable({ url }: { url: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(url).then(() => toast.success("URL copiada"));
      }}
      className="flex w-full items-center gap-1.5 rounded bg-muted px-2 py-1 text-left font-mono text-[11px] text-foreground"
    >
      <span className="truncate">{url}</span>
      <Copy className="ml-auto h-3 w-3 shrink-0" />
    </button>
  );
}
