import { NextRequest, NextResponse } from "next/server";
import { requireMember } from "@/lib/api-auth";
import { canAccessContact } from "@/lib/team";
import { deleteDocument, documentContact, getDocument } from "@/lib/documents";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireMember();
  if ("response" in auth) return auth.response;
  const { id } = await params;

  const doc = await getDocument(id);
  const contact = doc ? await documentContact(doc) : null;
  if (!doc || !contact || !canAccessContact(auth.member, contact)) {
    return NextResponse.json({ error: "Document introuvable" }, { status: 404 });
  }

  try {
    await deleteDocument(id);
  } catch (err) {
    console.error("[documents] échec de la suppression", id, err);
    return NextResponse.json({ error: "Impossible de supprimer du stockage" }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
