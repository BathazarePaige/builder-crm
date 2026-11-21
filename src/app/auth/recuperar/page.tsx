import Link from "next/link";
import { FormRecuperar } from "@/components/auth/FormRecuperar";
import { correoDeAccesoActivo } from "@/lib/auth-correo";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Récupérer l’accès",
};

export default function RecuperarPage() {
  const activo = correoDeAccesoActivo();

  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">
          Récupérer l’accès
        </h1>
        <p className="text-sm text-muted-foreground">
          {activo
            ? "Nous vous envoyons un lien pour choisir un nouveau mot de passe"
            : "Cette instance n’envoie pas encore d’e-mails"}
        </p>
      </div>

      {activo ? (
        <FormRecuperar />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            L’accès est géré par un administrateur dans Réglages → Équipe : demandez-lui de vous créer un nouveau mot de passe.
          </p>
          <Button render={<Link href="/login" />} variant="outline" className="w-full h-10">
            Retour à la connexion
          </Button>
        </div>
      )}
    </>
  );
}
