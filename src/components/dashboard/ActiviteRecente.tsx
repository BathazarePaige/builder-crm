import Link from "next/link";
import { Clock, FileText, Mail, Phone, Users, type LucideIcon } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";
import type { DatosTablero } from "@/lib/tableau-de-bord/donnees";
import { Carte, Vide } from "./Carte";
import { COULEURS } from "./palette";

const TYPES: Record<string, { icone: LucideIcon; couleur: string }> = {
  call: { icone: Phone, couleur: COULEURS.bleu },
  email: { icone: Mail, couleur: COULEURS.violet },
  meeting: { icone: Users, couleur: COULEURS.vert },
  note: { icone: FileText, couleur: COULEURS.orange },
  follow_up: { icone: Clock, couleur: COULEURS.rose },
};

export function ActiviteRecente({ elements }: { elements: DatosTablero["recientes"] }) {
  return (
    <Carte titre="Activité récente" lien={{ href: "/activities", label: "Voir tout" }}>
      {elements.length === 0 ? (
        <Vide>Aucune activité pour l’instant.</Vide>
      ) : (
        <ul className="space-y-4">
          {elements.map((a) => {
            const t = TYPES[a.tipo] ?? TYPES.note;
            return (
              <li key={a.id} className="flex items-start gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${t.couleur}1A`, color: t.couleur }}>
                  <t.icone className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[12.5px] font-medium leading-snug">{a.descripcion}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{a.contacto}</p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatDistanceToNowStrict(new Date(a.fecha), { locale: fr, addSuffix: true })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/activities"
        className="mt-4 flex w-full items-center justify-center rounded-xl border border-border py-2.5 text-[12.5px] font-medium hover:bg-muted"
      >
        Voir toute l’activité
      </Link>
    </Carte>
  );
}
