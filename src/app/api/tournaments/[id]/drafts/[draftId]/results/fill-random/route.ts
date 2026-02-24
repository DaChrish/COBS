import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type RouteContext = { params: Promise<{ id: string; draftId: string }> };

function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function randomMatchResult(rng: () => number): [number, number] {
  const r = rng();
  let p1: number, p2: number;
  if (r < 0.25) {
    p1 = 2; p2 = 0;
  } else if (r < 0.5) {
    p1 = 2; p2 = 1;
  } else if (r < 0.75) {
    p1 = 1; p2 = 2;
  } else {
    p1 = 0; p2 = 2;
  }
  if (rng() < 0.5) return [p2, p1];
  return [p1, p2];
}

/**
 * Füllt genau eine Runde Paarungen (die Runde mit unreported Matches und kleinster swissRound) mit zufälligen Ergebnissen.
 */
export async function POST(request: NextRequest, context: RouteContext) {
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

    const unreported = await prisma.match.findMany({
      where: {
        pod: { draftId },
        reported: false,
      },
      orderBy: { swissRound: "asc" },
    });

    if (unreported.length === 0) {
      return NextResponse.json(
        { error: "Keine ungemeldeten Matches in diesem Draft." },
        { status: 400 }
      );
    }

    const roundToFill = unreported[0].swissRound;
    const matchesInRound = unreported.filter((m) => m.swissRound === roundToFill);

    let body: { seed?: number } = {};
    try {
      body = await request.json();
    } catch {
      // optional body
    }
    const seed: number =
      typeof body.seed === "number" && Number.isInteger(body.seed) ? body.seed : Date.now();
    const rng = createRng(seed);

    const updated = [];
    for (const match of matchesInRound) {
      if (match.isBye) {
        const m = await prisma.match.update({
          where: { id: match.id },
          data: { player1Wins: 2, player2Wins: 0, reported: true },
        });
        updated.push(m);
        continue;
      }
      const [p1, p2] = randomMatchResult(rng);
      const m = await prisma.match.update({
        where: { id: match.id },
        data: { player1Wins: p1, player2Wins: p2, reported: true },
      });
      updated.push(m);
    }

    return NextResponse.json({
      round: roundToFill,
      updated: updated.length,
      matches: updated,
    });
  } catch (error) {
    console.error("Fehler beim zufälligen Füllen der Ergebnisse:", error);
    return NextResponse.json(
      { error: "Ergebnisse konnten nicht gefüllt werden." },
      { status: 500 }
    );
  }
}
