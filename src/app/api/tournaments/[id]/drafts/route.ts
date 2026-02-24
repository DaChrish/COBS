import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  runOptimizedRound,
  setScoreWant,
  setScoreAvoid,
  setScoreNeutral,
  setMatchPointPenaltyWeight,
  setEarlyRoundUnpopularBonus,
  setLowerStandingBonus,
  setRepeatAvoidMultiplier,
} from "@/lib/algorithm/tournamentOptimizer";
import { calculatePointsFromResults } from "@/lib/algorithm/swiss";
import type { PlayerInput, CubeInput } from "@/lib/algorithm/types";

type RouteContext = { params: Promise<{ id: string }> };

// Alle Drafts eines Turniers mit Pods auflisten
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const drafts = await prisma.draft.findMany({
      where: { tournamentId: id },
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
            matches: { orderBy: { swissRound: "asc" } },
          },
          orderBy: { podNumber: "asc" },
        },
        photos: {
          include: {
            tournamentPlayer: {
              include: { player: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { roundNumber: "asc" },
    });

    return NextResponse.json(drafts);
  } catch (error) {
    console.error("Fehler beim Laden der Drafts:", error);
    return NextResponse.json(
      { error: "Drafts konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Nächsten Draft mit dem Tournament-Optimizer generieren
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is optional
    }

    if (typeof body.scoreWant === "number") setScoreWant(body.scoreWant);
    if (typeof body.scoreAvoid === "number") setScoreAvoid(body.scoreAvoid);
    if (typeof body.scoreNeutral === "number") setScoreNeutral(body.scoreNeutral);
    if (typeof body.matchPointPenaltyWeight === "number") setMatchPointPenaltyWeight(body.matchPointPenaltyWeight);
    if (typeof body.earlyRoundBonus === "number") setEarlyRoundUnpopularBonus(body.earlyRoundBonus);
    if (typeof body.lowerStandingBonus === "number") setLowerStandingBonus(body.lowerStandingBonus);
    if (typeof body.repeatAvoidMultiplier === "number") setRepeatAvoidMultiplier(body.repeatAvoidMultiplier);

    const tournament = await prisma.tournament.findUnique({
      where: { id },
      include: {
        players: {
          include: {
            votes: true,
            player: { select: { name: true } },
          },
        },
        cubes: true,
        drafts: {
          include: {
            pods: {
              include: {
                matches: true,
                players: { select: { tournamentPlayerId: true } },
              },
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

    // Bereits verwendete Cube-IDs ermitteln
    const usedCubeIds = tournament.drafts.flatMap(
      (d: { pods: Array<{ cubeId: string }> }) => d.pods.map((p) => p.cubeId)
    );

    // Nächste Draft-Nummer berechnen
    const nextRound = tournament.drafts.length + 1;

    type DraftPodMatch = {
      player1Id: string;
      player2Id: string | null;
      player1Wins: number;
      player2Wins: number;
      isBye: boolean;
      reported: boolean;
    };

    const allMatches = (tournament.drafts as Array<{ pods: Array<{ matches: DraftPodMatch[] }> }>).flatMap((d) =>
      d.pods.flatMap((p) =>
        p.matches.filter((m) => m.reported).map((m) => ({ player1Id: m.player1Id, player2Id: m.player2Id, player1Wins: m.player1Wins, player2Wins: m.player2Wins, isBye: m.isBye }))
      )
    );
    const pointsFromMatches = calculatePointsFromResults(allMatches);

    type TournamentPlayerWithVotes = {
      id: string;
      dropped: boolean;
      votes: Array<{ cubeId: string; vote: string }>;
    };

    // Spieler-Eingabe: matchPoints/gameWins/gameLosses aus Match-Ergebnissen (Single Source of Truth)
    // Compute priorAvoidCount: how many times each player was assigned an AVOID cube in previous drafts
    type DraftPodWithPlayers = { cubeId: string; players: Array<{ tournamentPlayerId: string }> };
    const priorAvoidCounts = new Map<string, number>();
    for (const draft of tournament.drafts as Array<{ pods: DraftPodWithPlayers[] }>) {
      for (const pod of draft.pods) {
        for (const pp of pod.players) {
          const tp = (tournament.players as TournamentPlayerWithVotes[]).find((p) => p.id === pp.tournamentPlayerId);
          if (!tp) continue;
          const vote = tp.votes.find((v) => v.cubeId === pod.cubeId)?.vote;
          if (vote === "AVOID") {
            priorAvoidCounts.set(tp.id, (priorAvoidCounts.get(tp.id) ?? 0) + 1);
          }
        }
      }
    }

    const playerInputs: PlayerInput[] = (tournament.players as TournamentPlayerWithVotes[])
      .filter((tp) => !tp.dropped)
      .map((tp) => {
        const pts = pointsFromMatches.get(tp.id) ?? { matchPoints: 0, gameWins: 0, gameLosses: 0 };
        return {
          id: tp.id,
          matchPoints: pts.matchPoints,
          gameWins: pts.gameWins,
          gameLosses: pts.gameLosses,
          dropped: tp.dropped,
          votes: Object.fromEntries(
            tp.votes.map((v) => [v.cubeId, v.vote])
          ) as Record<string, "DESIRED" | "NEUTRAL" | "AVOID">,
          priorAvoidCount: priorAvoidCounts.get(tp.id) ?? 0,
        };
      });

    const cubeInputs: CubeInput[] = (tournament.cubes as Array<{ id: string; name: string; maxPlayers: number | null }>).map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.maxPlayers != null ? { maxPlayers: c.maxPlayers } : {}),
    }));

    // Tournament Optimizer ausführen
    const result = await runOptimizedRound(playerInputs, cubeInputs, {
      roundNumber: nextRound,
      usedCubeIds,
    });

    if (result.pods.length === 0) {
      return NextResponse.json(
        { error: "Keine Pods generiert." },
        { status: 400 }
      );
    }

    // Draft und Pods in der Datenbank anlegen
    const draft = await prisma.draft.create({
      data: {
        tournamentId: id,
        roundNumber: nextRound,
        status: "ACTIVE",
        pods: {
          create: result.pods.map((pod) => ({
            cubeId: pod.cubeId,
            podNumber: pod.podNumber,
            podSize: pod.podSize,
            players: {
              create: pod.playerIds.map((tpId) => ({
                tournamentPlayerId: tpId,
              })),
            },
          })),
        },
      },
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
          },
          orderBy: { podNumber: "asc" },
        },
      },
    });

    return NextResponse.json(
      { draft, warnings: [] as string[] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Generieren des Drafts:", error);
    return NextResponse.json(
      { error: "Draft konnte nicht generiert werden." },
      { status: 500 }
    );
  }
}
