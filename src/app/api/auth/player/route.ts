import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { calculatePointsFromResults } from "@/lib/algorithm/swiss";

// Spieler-Login: Name + Passwort → Spielerdaten + Turnierliste
export async function POST(request: NextRequest) {
  try {
    const { name, password } = await request.json();

    if (!name || !password) {
      return NextResponse.json(
        { error: "Name und Passwort sind erforderlich." },
        { status: 400 }
      );
    }

    const player = await prisma.player.findUnique({ where: { name } });

    if (!player) {
      return NextResponse.json(
        { error: "Spieler nicht gefunden." },
        { status: 404 }
      );
    }

    const valid = await bcrypt.compare(password, player.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Falsches Passwort." },
        { status: 401 }
      );
    }

    // Alle Turniere des Spielers laden (inkl. Matches für Punkteberechnung)
    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: { playerId: player.id },
      include: {
        tournament: {
          include: {
            _count: { select: { players: true, cubes: true, drafts: true } },
            drafts: {
              include: {
                pods: { include: { matches: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    type PodWithMatches = { matches: Array<{ player1Id: string; player2Id: string | null; player1Wins: number; player2Wins: number; isBye: boolean; reported: boolean }> };
    const getMatchPoints = (tp: (typeof tournamentPlayers)[number]) => {
      const drafts = tp.tournament.drafts as Array<{ pods: PodWithMatches[] }> | undefined;
      if (!drafts?.length) return 0;
      const allMatches = drafts.flatMap((d) =>
        d.pods.flatMap((p) =>
          p.matches.filter((m) => m.reported).map((m) => ({ player1Id: m.player1Id, player2Id: m.player2Id, player1Wins: m.player1Wins, player2Wins: m.player2Wins, isBye: m.isBye }))
        )
      );
      const points = calculatePointsFromResults(allMatches);
      return points.get(tp.id)?.matchPoints ?? 0;
    };

    return NextResponse.json({
      player: { id: player.id, name: player.name },
      tournaments: tournamentPlayers.map((tp) => ({
        tournamentPlayerId: tp.id,
        tournamentId: tp.tournament.id,
        name: tp.tournament.name,
        status: tp.tournament.status,
        date: tp.tournament.date,
        matchPoints: getMatchPoints(tp),
        dropped: tp.dropped,
        playerCount: tp.tournament._count.players,
        cubeCount: tp.tournament._count.cubes,
        draftCount: tp.tournament._count.drafts,
      })),
    });
  } catch (error) {
    console.error("Fehler beim Spieler-Login:", error);
    return NextResponse.json(
      { error: "Login fehlgeschlagen." },
      { status: 500 }
    );
  }
}
