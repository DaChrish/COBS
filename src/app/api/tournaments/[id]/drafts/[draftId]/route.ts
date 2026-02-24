import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; draftId: string }> };

// Einzelnen Draft löschen (Pods, Matches, Fotos werden durch Cascade mitgelöscht)
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, draftId } = await context.params;

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, tournamentId: id },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft nicht gefunden oder gehört nicht zu diesem Turnier." },
        { status: 404 }
      );
    }

    await prisma.draft.delete({
      where: { id: draftId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Fehler beim Löschen des Drafts:", error);
    return NextResponse.json(
      { error: "Draft konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}
