import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

type RouteContext = { params: Promise<{ id: string }> };

// Spieler tritt einem Turnier bei
// Erstellt Player falls nötig, erstellt TournamentPlayer, legt NEUTRAL-Votes an
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { name, password, joinCode, playerId: existingPlayerId } = body;

    // Turnier prüfen und Join-Code validieren
    const tournament = await prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      return NextResponse.json(
        { error: "Turnier nicht gefunden." },
        { status: 404 }
      );
    }

    if (joinCode && tournament.joinCode !== joinCode) {
      return NextResponse.json(
        { error: "Ungültiger Beitritts-Code." },
        { status: 403 }
      );
    }

    let player;

    if (existingPlayerId) {
      // Bereits authentifizierter Spieler (über Dashboard/Session)
      player = await prisma.player.findUnique({ where: { id: existingPlayerId } });
      if (!player) {
        return NextResponse.json(
          { error: "Spieler nicht gefunden." },
          { status: 404 }
        );
      }
    } else {
      // Klassischer Flow: Name + Passwort
      if (!name || !password) {
        return NextResponse.json(
          { error: "Name und Passwort sind erforderlich." },
          { status: 400 }
        );
      }

      player = await prisma.player.findUnique({ where: { name } });

      if (player) {
        const valid = await bcrypt.compare(password, player.passwordHash);
        if (!valid) {
          return NextResponse.json(
            { error: "Falsches Passwort für diesen Spielernamen." },
            { status: 401 }
          );
        }
      } else {
        const passwordHash = await bcrypt.hash(password, 10);
        player = await prisma.player.create({
          data: { name, passwordHash },
        });
      }
    }

    // Prüfen ob Spieler bereits im Turnier ist
    const existing = await prisma.tournamentPlayer.findUnique({
      where: {
        tournamentId_playerId: {
          tournamentId: id,
          playerId: player.id,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Spieler ist bereits im Turnier.", tournamentPlayer: existing },
        { status: 409 }
      );
    }

    // TournamentPlayer anlegen
    const tournamentPlayer = await prisma.tournamentPlayer.create({
      data: {
        tournamentId: id,
        playerId: player.id,
      },
    });

    // NEUTRAL-Votes für alle bestehenden Cubes anlegen
    const cubes = await prisma.tournamentCube.findMany({
      where: { tournamentId: id },
    });

    if (cubes.length > 0) {
      await prisma.cubeVote.createMany({
        data: cubes.map((cube: { id: string }) => ({
          tournamentPlayerId: tournamentPlayer.id,
          cubeId: cube.id,
        })),
      });
    }

    return NextResponse.json(
      {
        player: { id: player.id, name: player.name },
        tournamentPlayer,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Beitreten:", error);
    return NextResponse.json(
      { error: "Beitritt fehlgeschlagen." },
      { status: 500 }
    );
  }
}
