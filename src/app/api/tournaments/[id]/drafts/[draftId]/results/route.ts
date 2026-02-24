import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; draftId: string }> };

// Alle Match-Ergebnisse eines Drafts laden
export async function GET(
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
        { error: "Draft nicht gefunden." },
        { status: 404 }
      );
    }

    const matches = await prisma.match.findMany({
      where: {
        pod: { draftId },
      },
      include: {
        player1: {
          include: {
            player: { select: { id: true, name: true } },
          },
        },
        player2: {
          include: {
            player: { select: { id: true, name: true } },
          },
        },
        pod: { select: { id: true, podNumber: true } },
      },
      orderBy: [{ swissRound: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(matches);
  } catch (error) {
    console.error("Fehler beim Laden der Ergebnisse:", error);
    return NextResponse.json(
      { error: "Ergebnisse konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Match-Ergebnis melden
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, draftId } = await context.params;
    const body = await request.json();
    const { matchId, player1Wins, player2Wins } = body;

    if (!matchId || player1Wins === undefined || player2Wins === undefined) {
      return NextResponse.json(
        { error: "matchId, player1Wins und player2Wins sind erforderlich." },
        { status: 400 }
      );
    }

    if (player1Wins < 0 || player2Wins < 0) {
      return NextResponse.json(
        { error: "Siege dürfen nicht negativ sein." },
        { status: 400 }
      );
    }

    // Match prüfen und sicherstellen, dass es zu diesem Draft gehört
    const match = await prisma.match.findFirst({
      where: {
        id: matchId,
        pod: { draftId, draft: { tournamentId: id } },
      },
    });

    if (!match) {
      return NextResponse.json(
        { error: "Match nicht gefunden." },
        { status: 404 }
      );
    }

    if (match.isBye) {
      return NextResponse.json(
        { error: "Bye-Matches können nicht gemeldet werden." },
        { status: 400 }
      );
    }

    const updated = await prisma.match.update({
      where: { id: matchId },
      data: {
        player1Wins,
        player2Wins,
        reported: true,
      },
    });

    // Single Source of Truth: Punkte werden nicht in TournamentPlayer gespeichert,
    // sondern bei Bedarf aus den Match-Ergebnissen berechnet (Standings, Tournament GET, etc.)
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Fehler beim Melden des Ergebnisses:", error);
    return NextResponse.json(
      { error: "Ergebnis konnte nicht gemeldet werden." },
      { status: 500 }
    );
  }
}
