import { FormDefinirClave } from "@/components/auth/FormDefinirClave";

export const metadata = {
  title: "Choisir le mot de passe",
};

export default function DefinirClavePage() {
  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">
          Choisissez votre mot de passe
        </h1>
        <p className="text-sm text-muted-foreground">
          Avec lui, vous entrez dans le CRM
        </p>
      </div>
      <FormDefinirClave />
    </>
  );
}
