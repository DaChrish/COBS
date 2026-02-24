import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

const VoteType = { DESIRED: "DESIRED", NEUTRAL: "NEUTRAL", AVOID: "AVOID" } as const;
type VoteValue = (typeof VoteType)[keyof typeof VoteType];

// Seedbarer RNG für reproduzierbare Votes
function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Namen für Test-Cubes (kurz und eindeutig)
function cubeName(index: number): string {
  const names = [
    "Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta",
    "Iota", "Kappa", "Lambda", "Mu", "Nu", "Xi", "Omicron", "Pi", "Rho",
    "Sigma", "Tau", "Upsilon", "Phi", "Chi", "Psi", "Omega",
  ];
  if (index < names.length) return `Cube ${names[index]}`;
  return `Cube ${index + 1}`;
}

// Eindeutige Spielernamen (Suffix verhindert Kollision mit anderen Turnieren)
function playerName(index: number, suffix: string): string {
  return `Spieler ${index + 1} (${suffix})`;
}

/**
 * Erstellt ein Test-Turnier mit vorgegebener Anzahl Cubes und Spieler,
 * generierten Namen und zufälligen Votes (seedbar).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      playerCount: rawPlayerCount,
      cubeCount: rawCubeCount,
      seed: rawSeed,
      adminCode,
    } = body;

    const playerCount = Math.max(2, Math.min(500, parseInt(String(rawPlayerCount), 10) || 16));
    const cubeCount = Math.max(1, Math.min(200, parseInt(String(rawCubeCount), 10) || 24));
    const seed = parseInt(String(rawSeed), 10);
    const useSeed = Number.isInteger(seed) ? seed : Date.now();

    if (!adminCode) {
      return NextResponse.json(
        { error: "Admin-Code ist erforderlich." },
        { status: 400 }
      );
    }

    const joinCode = uuidv4().slice(0, 8).toUpperCase();
    const name = `Test (${cubeCount} Cubes, ${playerCount} Spieler)`;
    const suffix = joinCode.slice(0, 6);

    const tournament = await prisma.tournament.create({
      data: { name, adminCode, joinCode },
    });

    const rng = createRng(useSeed);
    const desiredRate = 0.3;
    const avoidRate = 0.2;

    const cubes = await Promise.all(
      Array.from({ length: cubeCount }, (_, i) =>
        prisma.tournamentCube.create({
          data: {
            tournamentId: tournament.id,
            name: cubeName(i),
            description: "",
          },
        })
      )
    );
    const cubeIds = cubes.map((c) => c.id);

    const defaultPasswordHash = await bcrypt.hash("test", 10);
    const players: { id: string; name: string }[] = [];

    for (let i = 0; i < playerCount; i++) {
      const player = await prisma.player.create({
        data: {
          name: playerName(i, suffix),
          passwordHash: defaultPasswordHash,
        },
      });
      players.push({ id: player.id, name: player.name });
    }

    const tournamentPlayers = await Promise.all(
      players.map((p) =>
        prisma.tournamentPlayer.create({
          data: { tournamentId: tournament.id, playerId: p.id },
        })
      )
    );

    const voteRows: { tournamentPlayerId: string; cubeId: string; vote: VoteValue }[] = [];
    for (let pi = 0; pi < tournamentPlayers.length; pi++) {
      for (let ci = 0; ci < cubeIds.length; ci++) {
        const r = rng();
        const vote: VoteValue =
          r < desiredRate ? VoteType.DESIRED : r < desiredRate + avoidRate ? VoteType.AVOID : VoteType.NEUTRAL;
        voteRows.push({
          tournamentPlayerId: tournamentPlayers[pi].id,
          cubeId: cubeIds[ci],
          vote,
        });
      }
    }

    await prisma.cubeVote.createMany({
      data: voteRows,
    });

    return NextResponse.json(
      {
        tournament: {
          id: tournament.id,
          name: tournament.name,
          joinCode,
          playerCount,
          cubeCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Fehler beim Erstellen des Test-Turniers:", error);
    return NextResponse.json(
      { error: "Test-Turnier konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
