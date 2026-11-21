import "server-only";
import { NextResponse } from "next/server";
import { getCurrentMember, type TeamMember } from "@/lib/team";

/**
 * Guardas para route handlers. Devuelven el miembro o la respuesta de error ya
 * armada, para que cada ruta sea:
 *
 *   const auth = await requireMember();
 *   if ("response" in auth) return auth.response;
 *   const { member } = auth;
 */

type Guard = { member: TeamMember } | { response: NextResponse };

export async function requireMember(): Promise<Guard> {
  const member = await getCurrentMember();
  if (!member) {
    return {
      response: NextResponse.json(
        { error: "Vous n’avez pas accès. Demandez à un administrateur de vous ajouter à l’équipe." },
        { status: 403 }
      ),
    };
  }
  return { member };
}

export async function requireAdmin(): Promise<Guard> {
  const auth = await requireMember();
  if ("response" in auth) return auth;
  if (auth.member.role !== "admin") {
    return {
      response: NextResponse.json(
        { error: "Seul un administrateur peut faire cela." },
        { status: 403 }
      ),
    };
  }
  return auth;
}
