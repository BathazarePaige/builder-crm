"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";
import { marca } from "@/lib/config";

const STORAGE_KEY = "crm-notifications";

// El estado vive en localStorage y en la API Notification del navegador; se lee con
// useSyncExternalStore para no setear estado dentro de un efecto. En el servidor
// (y durante la hidratacion) todo vale `false`, por eso existe el estado "Chargement".
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
const notifyChange = () => window.dispatchEvent(new Event("storage"));

export function NotificationToggle() {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const supported = useSyncExternalStore(
    subscribe,
    () => "Notification" in window,
    () => false
  );
  const enabled = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY) === "true",
    () => false
  );

  const toggle = async () => {
    if (!supported) {
      toast.error("Votre navigateur ne gère pas les notifications");
      return;
    }

    if (!enabled) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        localStorage.setItem(STORAGE_KEY, "true");
        notifyChange();
        toast.success("Notifications activées");

        // Show test notification
        new Notification(marca().nombreCorto, {
          body: "Les notifications sont actives. Vous serez alerté des relances à faire.",
        });
      } else {
        toast.error("Autorisation de notification refusée");
      }
    } else {
      localStorage.setItem(STORAGE_KEY, "false");
      notifyChange();
      toast.success("Notifications désactivées");
    }
  };

  if (!mounted) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border opacity-60">
        <div className="flex items-center gap-3">
          <BellOff className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Notifications du navigateur</p>
            <p className="text-xs text-muted-foreground">Chargement…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!supported) return null;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <div className="flex items-center gap-3">
        {enabled ? (
          <Bell className="h-5 w-5 text-primary-ink" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">
            Notifications du navigateur
          </p>
          <p className="text-xs text-muted-foreground">
            {enabled
              ? "Vous recevrez une alerte pour les relances en retard"
              : "Activez-les pour être alerté des relances"}
          </p>
        </div>
      </div>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={toggle}
        className="cursor-pointer"
      >
        {enabled ? "Désactiver" : "Activer"}
      </Button>
    </div>
  );
}
