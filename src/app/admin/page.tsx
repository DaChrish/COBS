"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";

// === Typen ===

interface Tournament {
  id: string;
  name: string;
  status: "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";
  joinCode: string;
  createdAt: string;
  _count: { players: number; cubes: number; drafts: number };
}

const STATUS_BADGE_VARIANT: Record<string, "default" | "warning" | "accent" | "success"> = {
  SETUP: "default",
  VOTING: "warning",
  DRAFTING: "accent",
  FINISHED: "success",
};

const STATUS_LABEL: Record<string, string> = {
  SETUP: "Setup",
  VOTING: "Voting",
  DRAFTING: "Drafting",
  FINISHED: "Beendet",
};

const STORAGE_KEY = "admin_password";

// === Hauptkomponente ===

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkingStorage, setCheckingStorage] = useState(true);

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [showTestModal, setShowTestModal] = useState(false);
  const [testPlayerCount, setTestPlayerCount] = useState("24");
  const [testCubeCount, setTestCubeCount] = useState("18");
  const [testSeed, setTestSeed] = useState("");
  const [testCreating, setTestCreating] = useState(false);
  const [testError, setTestError] = useState("");

  // Gespeichertes Passwort beim Laden prüfen
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      validatePassword(stored);
    } else {
      setCheckingStorage(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validatePassword = async (pw: string) => {
    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.success) {
        setAuthenticated(true);
        localStorage.setItem(STORAGE_KEY, pw);
        setPassword(pw);
        setAuthError("");
      } else {
        localStorage.removeItem(STORAGE_KEY);
        setAuthError(data.error || "Falsches Passwort.");
      }
    } catch {
      setAuthError("Verbindungsfehler.");
    } finally {
      setCheckingStorage(false);
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setAuthLoading(true);
    setAuthError("");
    await validatePassword(password);
  };

  // Turniere laden, sobald authentifiziert
  const loadTournaments = useCallback(async () => {
    setTournamentsLoading(true);
    try {
      const res = await fetch("/api/tournaments");
      if (res.ok) {
        const data = await res.json();
        setTournaments(data);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setTournamentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) loadTournaments();
  }, [authenticated, loadTournaments]);

  // Neues Turnier erstellen
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTournamentName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTournamentName.trim(), adminCode: password }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewTournamentName("");
        await loadTournaments();
      } else {
        const data = await res.json();
        setCreateError(data.error || "Fehler beim Erstellen.");
      }
    } catch {
      setCreateError("Verbindungsfehler.");
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuthenticated(false);
    setPassword("");
    setTournaments([]);
  };

  const handleCreateTestTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    const players = parseInt(testPlayerCount, 10) || 24;
    const cubes = parseInt(testCubeCount, 10) || 18;
    if (players < 2 || cubes < 1) return;
    setTestCreating(true);
    setTestError("");
    try {
      const body: Record<string, unknown> = {
        playerCount: players,
        cubeCount: cubes,
        adminCode: password,
      };
      if (testSeed.trim()) body.seed = parseInt(testSeed, 10);
      const res = await fetch("/api/tournaments/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.tournament?.id) {
        setShowTestModal(false);
        await loadTournaments();
        window.location.href = `/admin/tournament/${data.tournament.id}`;
      } else {
        setTestError(data.error || "Test-Turnier konnte nicht erstellt werden.");
      }
    } catch {
      setTestError("Verbindungsfehler.");
    } finally {
      setTestCreating(false);
    }
  };

  // Ladebildschirm während localStorage-Prüfung
  if (checkingStorage) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // Passwort-Eingabe, wenn nicht authentifiziert
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-sm p-6">
          <h1 className="text-xl font-semibold mb-6 text-center">Admin-Zugang</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              id="admin-password"
              type="password"
              label="Passwort"
              placeholder="Admin-Passwort eingeben"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={authError}
              autoFocus
            />
            <Button type="submit" className="w-full" loading={authLoading}>
              Anmelden
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">
              ← Zurück zur Startseite
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Dashboard nach erfolgreicher Authentifizierung
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Kopfzeile */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Turniere</h1>
            <p className="text-sm text-muted mt-1">Verwalte deine Draft-Turniere</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={() => setShowTestModal(true)}>
              Test-Turnier
            </Button>
            <Button variant="primary" onClick={() => setShowCreateModal(true)}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Neues Turnier
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Abmelden
            </Button>
          </div>
        </div>

        {/* Turnierliste */}
        {tournamentsLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        ) : tournaments.length === 0 ? (
          <Card className="text-center py-16">
            <p className="text-muted mb-4">Noch keine Turniere vorhanden.</p>
            <Button variant="secondary" onClick={() => setShowCreateModal(true)}>
              Erstes Turnier erstellen
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/admin/tournament/${t.id}`}>
                <Card hover className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <h2 className="text-lg font-semibold truncate">{t.name}</h2>
                      <Badge variant={STATUS_BADGE_VARIANT[t.status] ?? "default"}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted">
                      <span>{new Date(t.createdAt).toLocaleDateString("de-DE")}</span>
                      <span>{t._count.players} Spieler</span>
                      <span>{t._count.cubes} Cubes</span>
                      <span>{t._count.drafts} Drafts</span>
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Neues Turnier erstellen */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Neues Turnier erstellen">
        <form onSubmit={handleCreateTournament} className="space-y-4">
          <Input
            id="tournament-name"
            label="Turniername"
            placeholder="z.B. Cube Draft Abend"
            value={newTournamentName}
            onChange={(e) => setNewTournamentName(e.target.value)}
            error={createError}
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
              Abbrechen
            </Button>
            <Button type="submit" loading={creating}>
              Erstellen
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Test-Turnier erstellen */}
      <Modal open={showTestModal} onClose={() => setShowTestModal(false)} title="Test-Turnier erstellen">
        <p className="text-sm text-muted mb-4">
          Erstellt ein Turnier mit vorgegebener Anzahl Cubes und Spieler, generierten Namen und zufälligen Votes (DESIRED/NEUTRAL/AVOID). Spieler-Passwort für alle: <strong>test</strong>.
        </p>
        <form onSubmit={handleCreateTestTournament} className="space-y-4">
          <Input
            id="test-cubes"
            label="Cube-Anzahl"
            type="number"
            min={1}
            max={200}
            value={testCubeCount}
            onChange={(e) => setTestCubeCount(e.target.value)}
          />
          <Input
            id="test-players"
            label="Spieleranzahl"
            type="number"
            min={2}
            max={500}
            value={testPlayerCount}
            onChange={(e) => setTestPlayerCount(e.target.value)}
          />
          <Input
            id="test-seed"
            label="Seed (optional)"
            type="number"
            placeholder="Zufällig"
            value={testSeed}
            onChange={(e) => setTestSeed(e.target.value)}
          />
          {testError && <p className="text-sm text-danger">{testError}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowTestModal(false)}>
              Abbrechen
            </Button>
            <Button type="submit" loading={testCreating}>
              Test-Turnier erstellen
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
