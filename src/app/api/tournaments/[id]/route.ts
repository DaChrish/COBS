import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculatePointsFromResults } from "@/lib/algorithm/swiss";

type RouteContext = { params: Promise<{ id: string }> };

// Einzelnes Turnier mit Spielern, Cubes und Drafts laden.
// matchPoints/gameWins/gameLosses werden aus Match-Ergebnissen berechnet (Single Source of Truth).
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          include: {
            player: { select: { id: true, name: true } },
            votes: { select: { cubeId: true, vote: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        cubes: { orderBy: { createdAt: "asc" } },
        drafts: {
          include: {
            pods: {
              include: {
                cube: { select: { id: true, name: true } },
                players: {
                  include: {
                    tournamentPlayer: {
                      include: {
                        player: { select: { id: true, name: true } },
                      },
                    },
                  },
                },
                matches: true,
              },
              orderBy: { podNumber: "asc" },
            },
          },
          orderBy: { roundNumber: "asc" },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Turnier nicht gefunden." },
        { status: 404 }
      );
    }

    const allMatches = (tournament.drafts as Array<{ pods: Array<{ matches: Array<{ player1Id: string; player2Id: string | null; player1Wins: number; player2Wins: number; isBye: boolean; reported: boolean }> }> }>)
      .flatMap((d) => d.pods.flatMap((p) => p.matches.filter((m) => m.reported).map((m) => ({ player1Id: m.player1Id, player2Id: m.player2Id, player1Wins: m.player1Wins, player2Wins: m.player2Wins, isBye: m.isBye }))));
    const pointsFromMatches = calculatePointsFromResults(allMatches);

    const playersWithComputedPoints = (tournament.players as Array<{ id: string; matchPoints: number; gameWins: number; gameLosses: number; [k: string]: unknown }>).map((p) => {
      const pts = pointsFromMatches.get(p.id) ?? { matchPoints: 0, gameWins: 0, gameLosses: 0 };
      return { ...p, matchPoints: pts.matchPoints, gameWins: pts.gameWins, gameLosses: pts.gameLosses };
    });

    return NextResponse.json({ ...tournament, players: playersWithComputedPoints });
  } catch (error) {
    console.error("Fehler beim Laden des Turniers:", error);
    return NextResponse.json(
      { error: "Turnier konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Turnier aktualisieren (Status, Name etc.)
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const existing = await prisma.tournament.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Turnier nicht gefunden." },
        { status: 404 }
      );
    }

    // Nur erlaubte Felder übernehmen
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.date !== undefined) updateData.date = new Date(body.date);

    const tournament = await prisma.tournament.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(tournament);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Turniers:", error);
    return NextResponse.json(
      { error: "Turnier konnte nicht aktualisiert werden." },
      { status: 500 }
    );
  }
}
