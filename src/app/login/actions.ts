"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hayMiembros } from "@/lib/team";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "L’e-mail et le mot de passe sont obligatoires." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  redirect("/");
}

/**
 * El registro publico esta abierto SOLO mientras no exista ningun miembro: la primera
 * cuenta de una instancia nueva queda como administrador (trigger
 * `on_auth_user_created`) y despues el registro se cierra solo. Los asesores se crean
 * desde Ajustes -> Equipo. `ALLOW_PUBLIC_SIGNUP=true` lo deja abierto siempre.
 */
export async function registroAbierto(): Promise<boolean> {
  if (process.env.ALLOW_PUBLIC_SIGNUP === "true") return true;
  return !(await hayMiembros());
}

export async function signUp(formData: FormData) {
  if (!(await registroAbierto())) {
    return {
      error:
        "Les inscriptions sont fermées. Demandez à un administrateur de vous ajouter à l’équipe.",
    };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !password) {
    return { error: "L’e-mail et le mot de passe sont obligatoires." };
  }
  if (password.length < 8) {
    return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    return {
      error:
        "Compte créé. Consultez vos e-mails pour confirmer avant de vous connecter.",
    };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
