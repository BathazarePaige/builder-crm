import { AuthForm } from "@/components/auth/AuthForm";
import { proveedoresExternos, NOMBRE_PROVEEDOR } from "@/lib/auth-proveedores";

export const metadata = {
  title: "Se connecter",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const externos = await proveedoresExternos();
  const proveedores = externos.map((id) => ({ id, nombre: NOMBRE_PROVEEDOR[id] }));

  return (
    <>
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight font-heading">
          Bon retour
        </h1>
        <p className="text-sm text-muted-foreground">
          Connectez-vous pour gérer votre pipeline
        </p>
      </div>
      <AuthForm mode="login" proveedores={proveedores} errorInicial={error ?? null} />
    </>
  );
}
