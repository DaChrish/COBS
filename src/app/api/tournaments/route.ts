import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Alle Turniere auflisten
export async function GET() {
  try {
    const tournaments = await prisma.tournament.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { players: true, cubes: true, drafts: true } },
      },
    });

    return NextResponse.json(tournaments);
  } catch (error) {
    console.error("Fehler beim Laden der Turniere:", error);
    return NextResponse.json(
      { error: "Turniere konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

// Neues Turnier erstellen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, adminCode } = body;

    if (!name || !adminCode) {
      return NextResponse.json(
        { error: "Name und Admin-Code sind erforderlich." },
        { status: 400 }
      );
    }

    // Join-Code: 6-stelliger alphanumerischer Code
    const joinCode = uuidv4().slice(0, 8).toUpperCase();

    const tournament = await prisma.tournament.create({
      data: {
        name,
        adminCode,
        joinCode,
      },
    });

    return NextResponse.json(tournament, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Erstellen des Turniers:", error);
    return NextResponse.json(
      { error: "Turnier konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
