import { NextRequest, NextResponse } from "next/server";
import { runSimulation, SimulationConfig } from "@/lib/algorithm/simulation";

// Simulation mit übergebener Konfiguration ausführen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config: SimulationConfig = {
      playerCount: body.playerCount ?? 64,
      cubeCount: body.cubeCount ?? 24,
      draftRounds: body.draftRounds ?? 3,
      swissRoundsPerDraft: body.swissRoundsPerDraft ?? 3,
      desiredRate: body.desiredRate ?? 0.3,
      avoidRate: body.avoidRate ?? 0.2,
      seed: body.seed,
    };

    // Plausibilitätsprüfung
    if (config.playerCount < 2 || config.playerCount > 1000) {
      return NextResponse.json(
        { error: "Spieleranzahl muss zwischen 2 und 1000 liegen." },
        { status: 400 }
      );
    }

    if (config.cubeCount < 1 || config.cubeCount > 200) {
      return NextResponse.json(
        { error: "Cube-Anzahl muss zwischen 1 und 200 liegen." },
        { status: 400 }
      );
    }

    const stats = await runSimulation(config);

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Fehler bei der Simulation:", error);
    return NextResponse.json(
      { error: "Simulation fehlgeschlagen." },
      { status: 500 }
    );
  }
}
