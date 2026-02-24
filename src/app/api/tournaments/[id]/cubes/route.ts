import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

// Alle Cubes eines Turniers auflisten
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const cubes = await prisma.tournamentCube.findMany({
      where: { tournamentId: id },
      include: {
        _count: { select: { votes: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(cubes);
  } catch (error) {
    console.error("Fehler beim Laden der Cubes:", error);
    return NextResponse.json(
      { error: "Cubes konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Neuen Cube zum Turnier hinzufügen
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { name, description, imageUrl, maxPlayers } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Cube-Name ist erforderlich." },
        { status: 400 }
      );
    }

    // Prüfen ob das Turnier existiert
    const tournament = await prisma.tournament.findUnique({ where: { id } });
    if (!tournament) {
      return NextResponse.json(
        { error: "Turnier nicht gefunden." },
        { status: 404 }
      );
    }

    const cube = await prisma.tournamentCube.create({
      data: {
        tournamentId: id,
        name,
        description: description ?? "",
        imageUrl: imageUrl ?? null,
        maxPlayers: maxPlayers != null ? Number(maxPlayers) : null,
      },
    });

    // Für alle bestehenden TournamentPlayer NEUTRAL-Votes anlegen
    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: id },
    });

    if (tournamentPlayers.length > 0) {
      await prisma.cubeVote.createMany({
        data: tournamentPlayers.map((tp: { id: string }) => ({
          tournamentPlayerId: tp.id,
          cubeId: cube.id,
        })),
      });
    }

    return NextResponse.json(cube, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen des Cubes:", error);
    return NextResponse.json(
      { error: "Cube konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
