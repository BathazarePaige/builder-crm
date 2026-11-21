"use client";

import { Bell, BellOff, BellRing, Smartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { usePush } from "@/lib/use-push";

/**
 * Activar/desactivar push en ESTE dispositivo. Cada asesor lo hace una vez en su
 * telefono; los avisos de las automatizaciones llegan ahi.
 */
export function PushSettings() {
  const push = usePush();

  const onToggle = async () => {
    const error =
      push.state === "subscribed" ? await push.unsubscribe() : await push.subscribe();
    if (error) toast.error(error);
    else
      toast.success(
        push.state === "subscribed"
          ? "Notifications désactivées sur cet appareil"
          : "Notifications activées sur cet appareil"
      );
  };

  const onTest = async () => {
    const error = await push.sendTest();
    if (error) toast.error(error);
    else toast.success("Test envoyé. Il devrait arriver dans quelques secondes.");
  };

  if (push.state === "loading") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border opacity-60">
        <BellOff className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Vérification de cet appareil…</p>
      </div>
    );
  }

  if (push.state === "ios-install") {
    return (
      <div className="p-3 rounded-lg border space-y-2">
        <div className="flex items-center gap-3">
          <Smartphone className="h-5 w-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Installez d’abord le CRM sur votre iPhone</p>
            <p className="text-xs text-muted-foreground">
              Sur iPhone, les notifications ne marchent qu’avec l’app installée sur l’écran d’accueil.
            </p>
          </div>
        </div>
        <ol className="text-xs text-muted-foreground list-decimal pl-9 space-y-0.5">
          <li>
            Touchez le bouton Partager <Share className="inline h-3 w-3" /> dans Safari
          </li>
          <li>Choisissez « Sur l’écran d’accueil »</li>
          <li>Ouvrez le CRM depuis la nouvelle icône et revenez ici</li>
        </ol>
      </div>
    );
  }

  if (push.state === "unsupported") {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border">
        <BellOff className="h-5 w-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-sm font-medium">Ce navigateur ne gère pas les notifications push</p>
          <p className="text-xs text-muted-foreground">
            Essayez Chrome, Edge ou Firefox, ou installez le CRM sur le téléphone.
          </p>
        </div>
      </div>
    );
  }

  if (!push.configured) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-500/40 bg-amber-500/5">
        <BellOff className="h-5 w-5 text-amber-600 shrink-0" />
        <div>
          <p className="text-sm font-medium">Les clés VAPID manquent sur le serveur</p>
          <p className="text-xs text-muted-foreground">
            Générez-les avec <code>npx web-push generate-vapid-keys</code> puis renseignez
            NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT.
          </p>
        </div>
      </div>
    );
  }

  const subscribed = push.state === "subscribed";
  const denied = push.state === "denied";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border">
        <div className="flex items-center gap-3 min-w-0">
          {subscribed ? (
            <BellRing className="h-5 w-5 text-primary-ink shrink-0" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium">Alertes sur cet appareil</p>
            <p className="text-xs text-muted-foreground">
              {denied
                ? "Bloquées par le navigateur. Réactivez-les dans les paramètres du site."
                : subscribed
                  ? `Actives sur ${push.devices} appareil${push.devices === 1 ? "" : "s"}.`
                  : "Recevez une alerte quand un contact vous est attribué."}
            </p>
          </div>
        </div>
        <Button
          variant={subscribed ? "outline" : "default"}
          size="sm"
          onClick={onToggle}
          disabled={push.busy || denied}
          className="cursor-pointer shrink-0"
        >
          {push.busy ? "..." : subscribed ? "Désactiver" : "Activer"}
        </Button>
      </div>

      {subscribed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onTest}
          className="cursor-pointer text-xs"
        >
          Envoyer une notification de test
        </Button>
      )}
    </div>
  );
}
