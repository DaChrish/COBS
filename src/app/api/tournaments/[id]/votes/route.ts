import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
type VoteType = "DESIRED" | "NEUTRAL" | "AVOID";

type RouteContext = { params: Promise<{ id: string }> };

// Votes eines Spielers für ein Turnier laden
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get("playerId");

    if (!playerId) {
      return NextResponse.json(
        { error: "Query-Parameter 'playerId' fehlt." },
        { status: 400 }
      );
    }

    // TournamentPlayer über playerId und tournamentId finden
    const tournamentPlayer = await prisma.tournamentPlayer.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId,
        },
      },
    });

    if (!tournamentPlayer) {
      return NextResponse.json(
        { error: "Spieler nicht in diesem Turnier gefunden." },
        { status: 404 }
      );
    }

    const votes = await prisma.cubeVote.findMany({
      where: { tournamentPlayerId: tournamentPlayer.id },
      include: {
        cube: { select: { id: true, name: true, description: true, imageUrl: true } },
      },
    });

    return NextResponse.json({ tournamentPlayerId: tournamentPlayer.id, votes });
  } catch (error) {
    console.error("Fehler beim Laden der Votes:", error);
    return NextResponse.json(
      { error: "Votes konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Votes aktualisieren
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    await context.params; // Param-Promise auflösen
    const body = await request.json();
    const { tournamentPlayerId, votes } = body as {
      tournamentPlayerId: string;
      votes: Array<{ cubeId: string; vote: VoteType }>;
    };

    if (!tournamentPlayerId || !Array.isArray(votes)) {
      return NextResponse.json(
        { error: "tournamentPlayerId und votes-Array sind erforderlich." },
        { status: 400 }
      );
    }

    // Gültige Vote-Werte prüfen
    const validVotes: VoteType[] = ["DESIRED", "NEUTRAL", "AVOID"];
    for (const v of votes) {
      if (!validVotes.includes(v.vote)) {
        return NextResponse.json(
          { error: `Ungültiger Vote-Typ: ${v.vote}` },
          { status: 400 }
        );
      }
    }

    // Alle Votes in einer Transaktion aktualisieren
    const updates = votes.map((v) =>
      prisma.cubeVote.update({
        where: {
          tournamentPlayerId_cubeId: {
            tournamentPlayerId,
            cubeId: v.cubeId,
          },
        },
        data: { vote: v.vote },
      })
    );

    const updated = await prisma.$transaction(updates);

    return NextResponse.json({ updated: updated.length });
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Votes:", error);
    return NextResponse.json(
      { error: "Votes konnten nicht aktualisiert werden." },
      { status: 500 }
    );
  }
}
