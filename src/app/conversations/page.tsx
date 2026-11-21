import { redirect } from "next/navigation";
import { listConversations } from "@/lib/conversations";
import { getCurrentMember, visibleOwnerId } from "@/lib/team";
import { ConversationsListLive } from "@/components/conversations/ConversationsListLive";
import { MessageSquare } from "lucide-react";

// El inbox lee la base en cada request: nunca se prerenderiza en build.
export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/sin-acceso");

  const conversations = await listConversations({
    ownerId: visibleOwnerId(member),
  });

  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top)-4rem)] md:h-[calc(100dvh-3.5rem-5rem)] overflow-hidden border border-border rounded-xl bg-card">
      <ConversationsListLive initialConversations={conversations} />

      <section className="flex-1 hidden md:flex flex-col items-center justify-center bg-background">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border bg-card mb-4">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-[15px] font-semibold tracking-tight">
          Choisissez une conversation
        </h2>
        <p className="text-[13px] text-muted-foreground mt-1.5 max-w-xs text-center">
          Les messages WhatsApp, Instagram et Messenger arrivent dans la liste
          de gauche. Ouvrez-en un pour voir l’historique et répondre.
        </p>
        {conversations.length === 0 && (
          <div className="mt-6 max-w-md text-center">
            <p className="text-[13px] text-muted-foreground">
              Pour voir la première conversation, écrivez à l’un des canaux
              connectés. Le webhook doit être configuré et pointer vers votre
              URL publique. L’état de chaque canal est visible dans Réglages.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
