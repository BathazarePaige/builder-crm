import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { registroAbierto } from "@/app/login/actions";
import { hayMiembros } from "@/lib/team";
import { proveedoresExternos, NOMBRE_PROVEEDOR } from "@/lib/auth-proveedores";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Créer le compte",
};

export default async function SignupPage() {
  const abierto = await registroAbierto();
  const primera = !(await hayMiembros());
  const externos = await proveedoresExternos();
  const proveedores = externos.map((id) => ({ id, nombre: NOMBRE_PROVEEDOR[id] }));

  if (!abierto) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">
          Les inscriptions sont fermées
        </h1>
        <p className="text-sm text-muted-foreground">
          Les comptes sont créés par un administrateur dans Réglages → Équipe.
        </p>
        <Link href="/login" className="text-sm text-primary-ink hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">
          {primera ? "Créez le compte administrateur" : "Créez votre compte"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {primera
            ? "C’est le premier compte de cette instance : il devient administrateur, puis les inscriptions se ferment."
            : "Gérez vos leads en quelques minutes"}
        </p>
      </div>
      <AuthForm mode="signup" proveedores={proveedores} />
    </>
  );
}
