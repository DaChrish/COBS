"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";

interface PlayerTournament {
  tournamentPlayerId: string;
  tournamentId: string;
  name: string;
  status: "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";
  date: string;
  matchPoints: number;
  dropped: boolean;
  playerCount: number;
  cubeCount: number;
  draftCount: number;
}

const STATUS_BADGE: Record<string, { variant: "default" | "warning" | "accent" | "success"; label: string }> = {
  SETUP: { variant: "default", label: "Setup" },
  VOTING: { variant: "warning", label: "Voting" },
  DRAFTING: { variant: "accent", label: "Läuft" },
  FINISHED: { variant: "success", label: "Beendet" },
};

export default function DashboardPage() {
  const router = useRouter();
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<PlayerTournament[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTournaments = useCallback(async (pid: string, pname: string) => {
    try {
      const res = await fetch("/api/auth/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pname, password: "__session_refresh__" }),
      });

      // Falls Session abgelaufen: Daten aus localStorage-Fallback laden
      if (!res.ok) {
        setLoading(false);
        return;
      }

      const data = await res.json();
      setTournaments(data.tournaments);

      // Sessions aktualisieren
      for (const t of data.tournaments) {
        localStorage.setItem(`tp_${t.tournamentId}`, t.tournamentPlayerId);
        localStorage.setItem(`player_${t.tournamentId}`, pid);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pid = localStorage.getItem("player_id");
    const pname = localStorage.getItem("player_name");

    if (!pid || !pname) {
      router.push("/login");
      return;
    }

    setPlayerId(pid);
    setPlayerName(pname);
    loadTournaments(pid, pname);
  }, [router, loadTournaments]);

  const handleLogout = () => {
    // Alle Player-Sessions entfernen
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("tp_") || key.startsWith("player_") || key.startsWith("impersonating_"))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.removeItem("player_id");
    localStorage.removeItem("player_name");
    router.push("/");
  };

  if (!playerName) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const activeTournaments = tournaments.filter((t) => t.status !== "FINISHED");
  const pastTournaments = tournaments.filter((t) => t.status === "FINISHED");

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-lg mx-auto space-y-8">

        {/* Kopfzeile */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Hallo, {playerName}</h1>
            <p className="text-sm text-muted mt-1">Deine Turniere</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Abmelden
          </Button>
        </div>

        {/* Neuem Turnier beitreten */}
        <Link href="/join">
          <Card hover className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="font-medium">Neuem Turnier beitreten</span>
            </div>
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Card>
        </Link>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : tournaments.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-muted">Du bist noch keinem Turnier beigetreten.</p>
            <p className="text-sm text-muted mt-1">Frag den Turnierleiter nach einem Beitritts-Code.</p>
          </Card>
        ) : (
          <>
            {/* Aktive Turniere */}
            {activeTournaments.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Aktiv</h2>
                {activeTournaments.map((t) => (
                  <TournamentCard key={t.tournamentId} tournament={t} />
                ))}
              </section>
            )}

            {/* Vergangene Turniere */}
            {pastTournaments.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Vergangen</h2>
                {pastTournaments.map((t) => (
                  <TournamentCard key={t.tournamentId} tournament={t} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TournamentCard({ tournament: t }: { tournament: PlayerTournament }) {
  const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.SETUP;

  return (
    <Link href={`/tournament/${t.tournamentId}`}>
      <Card hover className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t.name}</h3>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <span>{t.playerCount} Spieler</span>
          <span>{t.cubeCount} Cubes</span>
          <span>{t.draftCount} Drafts</span>
          <span className="ml-auto font-mono">{t.matchPoints} Punkte</span>
        </div>
      </Card>
    </Link>
  );
}
