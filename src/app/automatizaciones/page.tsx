"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { AutomationsList } from "@/components/automations/AutomationsList";

export default function AutomatizacionesPage() {
  return (
    <div>
      <PageHeader
        title="Automatisations"
        subtitle="Des règles qui s’exécutent toutes seules quand il se passe quelque chose dans le CRM"
      />
      <AutomationsList />
    </div>
  );
}
