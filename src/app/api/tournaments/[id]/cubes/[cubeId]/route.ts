import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; cubeId: string }> };

// Cube aus dem Turnier entfernen (kaskadiert auch zugehörige Votes)
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, cubeId } = await context.params;

    const cube = await prisma.tournamentCube.findFirst({
      where: { id: cubeId, tournamentId: id },
    });

    if (!cube) {
      return NextResponse.json(
        { error: "Cube nicht gefunden." },
        { status: 404 }
      );
    }

    await prisma.tournamentCube.delete({ where: { id: cubeId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Fehler beim Löschen des Cubes:", error);
    return NextResponse.json(
      { error: "Cube konnte nicht gelöscht werden." },
      { status: 500 }
    );
  }
}
