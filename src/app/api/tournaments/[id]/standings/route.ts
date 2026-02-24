import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateTiebreakers, calculatePointsFromResults } from "@/lib/algorithm/swiss";
import type { MatchResult } from "@/lib/algorithm/types";

type RouteContext = { params: Promise<{ id: string }> };

// Standings mit Tiebreakern berechnen und zurückgeben
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
          },
        },
        drafts: {
          include: {
            pods: {
              include: {
                matches: true,
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Turnier nicht gefunden." },
        { status: 404 }
      );
    }

    interface DraftPodMatch {
      player1Id: string;
      player2Id: string | null;
      player1Wins: number;
      player2Wins: number;
      isBye: boolean;
      reported: boolean;
    }

    interface TournamentPlayerEntry {
      id: string;
      matchPoints: number;
      gameWins: number;
      gameLosses: number;
      dropped: boolean;
      player: { id: string; name: string };
    }

    // Alle gemeldeten Matches sammeln
    const allMatches: MatchResult[] = tournament.drafts.flatMap(
      (draft: { pods: Array<{ matches: DraftPodMatch[] }> }) =>
        draft.pods.flatMap((pod) =>
          pod.matches
            .filter((m) => m.reported)
            .map((m) => ({
              player1Id: m.player1Id,
              player2Id: m.player2Id,
              player1Wins: m.player1Wins,
              player2Wins: m.player2Wins,
              isBye: m.isBye,
            }))
        )
    );

    const players = tournament.players as TournamentPlayerEntry[];
    const playerIds = players.map((tp) => tp.id);
    const tiebreakers = calculateTiebreakers(playerIds, allMatches);
    const pointsFromMatches = calculatePointsFromResults(allMatches);

    // Standings: matchPoints/gameWins/gameLosses aus Match-Ergebnissen (Single Source of Truth)
    const standings = players.map((tp) => {
      const tb = tiebreakers.get(tp.id) ?? { omw: 0.33, gw: 0.33, ogw: 0.33 };
      const pts = pointsFromMatches.get(tp.id) ?? { matchPoints: 0, gameWins: 0, gameLosses: 0 };

      const playerMatches = allMatches.filter(
        (m) => m.player1Id === tp.id || m.player2Id === tp.id
      );

      let matchWins = 0;
      let matchLosses = 0;
      let matchDraws = 0;

      for (const m of playerMatches) {
        if (m.isBye && m.player1Id === tp.id) {
          matchWins++;
          continue;
        }
        const isP1 = m.player1Id === tp.id;
        const myWins = isP1 ? m.player1Wins : m.player2Wins;
        const oppWins = isP1 ? m.player2Wins : m.player1Wins;

        if (myWins > oppWins) matchWins++;
        else if (oppWins > myWins) matchLosses++;
        else matchDraws++;
      }

      return {
        tournamentPlayerId: tp.id,
        playerId: tp.player.id,
        playerName: tp.player.name,
        matchPoints: pts.matchPoints,
        matchWins,
        matchLosses,
        matchDraws,
        gameWins: pts.gameWins,
        gameLosses: pts.gameLosses,
        omwPercent: Math.round(tb.omw * 10000) / 100,
        gwPercent: Math.round(tb.gw * 10000) / 100,
        ogwPercent: Math.round(tb.ogw * 10000) / 100,
        dropped: tp.dropped,
      };
    });

    type StandingEntry = (typeof standings)[number];

    // Sortierung: Match-Punkte > OMW% > GW% > OGW%
    standings.sort((a: StandingEntry, b: StandingEntry) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      if (b.omwPercent !== a.omwPercent) return b.omwPercent - a.omwPercent;
      if (b.gwPercent !== a.gwPercent) return b.gwPercent - a.gwPercent;
      return b.ogwPercent - a.ogwPercent;
    });

    // Platzierung hinzufügen
    const ranked = standings.map((s: StandingEntry, i: number) => ({ rank: i + 1, ...s }));

    return NextResponse.json(ranked);
  } catch (error) {
    console.error("Fehler beim Berechnen der Standings:", error);
    return NextResponse.json(
      { error: "Standings konnten nicht berechnet werden." },
      { status: 500 }
    );
  }
}
