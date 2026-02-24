import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
type PhotoType = "POOL" | "DECK" | "RETURNED";
type RouteContext = { params: Promise<{ id: string }> };

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

// Foto hochladen (Multipart Form Data)
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const tournamentPlayerId = formData.get("tournamentPlayerId") as string | null;
    const draftId = formData.get("draftId") as string | null;
    const type = formData.get("type") as string | null;

    if (!file || !tournamentPlayerId || !draftId || !type) {
      return NextResponse.json(
        { error: "file, tournamentPlayerId, draftId und type sind erforderlich." },
        { status: 400 }
      );
    }

    // Typ validieren
    const validTypes: PhotoType[] = ["POOL", "DECK", "RETURNED"];
    if (!validTypes.includes(type as PhotoType)) {
      return NextResponse.json(
        { error: `Ungültiger Foto-Typ: ${type}` },
        { status: 400 }
      );
    }

    // Dateigröße prüfen
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Datei ist zu groß. Maximal 25 MB erlaubt." },
        { status: 400 }
      );
    }

    // Draft gehört zum Turnier prüfen
    const draft = await prisma.draft.findFirst({
      where: { id: draftId, tournamentId: id },
    });

    if (!draft) {
      return NextResponse.json(
        { error: "Draft nicht gefunden." },
        { status: 404 }
      );
    }

    // TournamentPlayer prüfen
    const tp = await prisma.tournamentPlayer.findFirst({
      where: { id: tournamentPlayerId, tournamentId: id },
    });

    if (!tp) {
      return NextResponse.json(
        { error: "Spieler nicht in diesem Turnier." },
        { status: 404 }
      );
    }

    // Dateiendung ermitteln und UUID-Dateinamen generieren
    const ext = path.extname(file.name) || ".jpg";
    const filename = `${uuidv4()}${ext}`;

    // Upload-Verzeichnis sicherstellen
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Datei schreiben
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);

    const imageUrl = `/uploads/${filename}`;

    // DraftPhoto in DB anlegen (upsert wegen unique constraint)
    const photo = await prisma.draftPhoto.upsert({
      where: {
        draftId_tournamentPlayerId_type: {
          draftId,
          tournamentPlayerId,
          type: type as PhotoType,
        },
      },
      update: { imageUrl },
      create: {
        draftId,
        tournamentPlayerId,
        type: type as PhotoType,
        imageUrl,
      },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    console.error("Fehler beim Hochladen des Fotos:", error);
    return NextResponse.json(
      { error: "Foto konnte nicht hochgeladen werden." },
      { status: 500 }
    );
  }
}
