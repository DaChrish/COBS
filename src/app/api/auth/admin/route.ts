import { NextRequest, NextResponse } from "next/server";

// Admin-Passwort gegen Umgebungsvariable prüfen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Passwort ist erforderlich." },
        { status: 400 }
      );
    }

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error("ADMIN_PASSWORD ist nicht konfiguriert.");
      return NextResponse.json(
        { error: "Server-Konfigurationsfehler." },
        { status: 500 }
      );
    }

    if (password === adminPassword) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Falsches Passwort." },
      { status: 401 }
    );
  } catch (error) {
    console.error("Fehler bei der Admin-Authentifizierung:", error);
    return NextResponse.json(
      { error: "Authentifizierung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
