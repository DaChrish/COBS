import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateSwissPairings } from "@/lib/algorithm/swiss";

type RouteContext = { params: Promise<{ id: string; draftId: string }> };

interface PodMatch {
  id: string;
  swissRound: number;
  player1Id: string;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  isBye: boolean;
  reported: boolean;
}

interface PodPlayerEntry {
  tournamentPlayerId: string;
}

interface PodEntry {
  id: string;
  players: PodPlayerEntry[];
  matches: PodMatch[];
}

// Swiss-Paarungen für die nächste Runde im Draft generieren
export async function POST(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id, draftId } = await context.params;

    const draft = await prisma.draft.findFirst({
      where: { id: draftId, tournamentId: id },
      include: {
        pods: {
          include: {
            players: {
              include: {
                tournamentPlayer: {
                  include: {
                    player: { select: { name: true } },
                  },
                },
              },
            },
            matches: true,
          },
        },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft nicht gefunden." },
        { status: 404 }
      );
    }

    const allCreatedMatches = [];
    const allWarnings: string[] = [];

    // Paarungen pro Pod separat generieren
    for (const pod of draft.pods as PodEntry[]) {
      // Höchste bisherige Swiss-Runde in diesem Pod ermitteln
      const maxRound = pod.matches.reduce(
        (max: number, m: PodMatch) => Math.max(max, m.swissRound),
        0
      );
      const nextSwissRound = maxRound + 1;

      // Aktuelle Punkte der Spieler im Pod berechnen
      const playerPoints = new Map<string, number>();
      for (const pp of pod.players) {
        playerPoints.set(pp.tournamentPlayerId, 0);
      }

      // Punkte aus bisherigen Matches im Pod zusammenrechnen
      for (const match of pod.matches) {
        if (!match.reported) continue;

        if (match.isBye) {
          const current = playerPoints.get(match.player1Id) ?? 0;
          playerPoints.set(match.player1Id, current + 3);
          continue;
        }

        if (match.player1Wins > match.player2Wins) {
          const current = playerPoints.get(match.player1Id) ?? 0;
          playerPoints.set(match.player1Id, current + 3);
        } else if (match.player2Wins > match.player1Wins && match.player2Id) {
          const current = playerPoints.get(match.player2Id) ?? 0;
          playerPoints.set(match.player2Id, current + 3);
        } else {
          // Unentschieden
          const c1 = playerPoints.get(match.player1Id) ?? 0;
          playerPoints.set(match.player1Id, c1 + 1);
          if (match.player2Id) {
            const c2 = playerPoints.get(match.player2Id) ?? 0;
            playerPoints.set(match.player2Id, c2 + 1);
          }
        }
      }

      const swissPlayers = pod.players.map((pp) => ({
        id: pp.tournamentPlayerId,
        matchPoints: playerPoints.get(pp.tournamentPlayerId) ?? 0,
      }));

      const previousMatches = pod.matches.map((m) => ({
        player1Id: m.player1Id,
        player2Id: m.player2Id,
      }));

      const previousByes = pod.matches
        .filter((m) => m.isBye)
        .map((m) => m.player1Id);

      const { pairings, warnings } = generateSwissPairings(
        swissPlayers,
        previousMatches,
        previousByes
      );

      allWarnings.push(...warnings);

      // Matches in der Datenbank anlegen
      for (const pairing of pairings) {
        const match = await prisma.match.create({
          data: {
            podId: pod.id,
            swissRound: nextSwissRound,
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            isBye: pairing.isBye,
            reported: pairing.isBye,
            player1Wins: pairing.isBye ? 2 : 0,
            player2Wins: 0,
          },
        });
        allCreatedMatches.push(match);
      }
    }

    return NextResponse.json(
      { matches: allCreatedMatches, warnings: allWarnings },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Generieren der Paarungen:", error);
    return NextResponse.json(
      { error: "Paarungen konnten nicht generiert werden." },
      { status: 500 }
    );
  }
}
