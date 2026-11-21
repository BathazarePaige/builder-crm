"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Kanban,
  Webhook,
  Bell,
  Copy,
  Bot,
  MessageSquare,
  Users,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { NotificationToggle } from "@/components/shared/NotificationToggle";
import { PageHeader } from "@/components/layout/PageHeader";
import { AgentSettings } from "@/components/settings/AgentSettings";
import { ChannelsSettings } from "@/components/settings/ChannelsSettings";
import { TeamSettings } from "@/components/settings/TeamSettings";
import Link from "next/link";
import { PushSettings } from "@/components/settings/PushSettings";

export default function SettingsPage() {
  const [stages, setStages] = useState<
    Array<{ id: string; name: string; color: string; order: number }>
  >([]);

  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then(setStages)
      .catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader
        title="Réglages"
        subtitle="Canaux, équipe, agent et notifications"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline stages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Kanban className="h-4 w-4" />
              Étapes du pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-muted/50"
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="text-sm flex-1">{stage.name}</span>
                  <Badge variant="outline" className="text-xs">
                    #{stage.order}
                  </Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Les étapes se modifient depuis le{" "}
              <Link href="/pipeline" className="text-primary-ink hover:underline">
                Pipeline
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        {/* Canales conectados */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Canaux
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelsSettings />
          </CardContent>
        </Card>

        {/* Equipo */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Équipe
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TeamSettings />
          </CardContent>
        </Card>

        {/* Automatizaciones: tienen su propia pagina */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Automatisations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Les règles, leur activation et leur historique sont dans{" "}
              <Link href="/automatizaciones" className="text-primary-ink hover:underline">
                Automatisations
              </Link>
              , dans le menu latéral.
            </p>
          </CardContent>
        </Card>

        {/* Agente IA */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agent IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentSettings />
          </CardContent>
        </Card>

        {/* Webhook config */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4" />
              Webhook
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Recevez des leads automatiquement depuis vos formulaires, pages d’atterrissage ou tout outil compatible webhook.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-muted p-2 rounded font-mono truncate">
                  POST {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/webhooks/leads
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/api/webhooks/leads`
                    );
                    toast.success("URL copiée");
                  }}
                  className="p-2 rounded hover:bg-muted cursor-pointer"
                  title="Copier l’URL"
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs font-mono">
                <p className="text-muted-foreground mb-1">Exemple :</p>
                <p>curl -X POST {typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/webhooks/leads \</p>
                <p className="pl-4">-H &quot;Content-Type: application/json&quot; \</p>
                <p className="pl-4">-d &apos;{`{"name":"Juan","email":"j@test.com","phone":"555-1234"}`}&apos;</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Champs acceptés en espagnol et en anglais : name/nombre, email/correo, phone/telefono, company/empresa, notes/notas.
                Si <code className="bg-muted px-1 rounded">LEADS_WEBHOOK_SECRET</code> est défini, envoyez-le dans l’en-tête{" "}
                <code className="bg-muted px-1 rounded">x-webhook-secret</code>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PushSettings />
            <Separator />
            <NotificationToggle />
            <p className="text-xs text-muted-foreground">
              En haut, les notifications push : elles arrivent sur le téléphone même CRM fermé. En bas, les alertes de relances en retard, qui ne marchent que CRM ouvert.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
