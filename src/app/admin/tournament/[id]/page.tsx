"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
// === Typen ===

interface Player {
  id: string;
  name: string;
}

interface TournamentPlayer {
  id: string;
  matchPoints: number;
  gameWins: number;
  gameLosses: number;
  dropped: boolean;
  createdAt: string;
  player: Player;
  votes?: { cubeId: string; vote: string }[];
}

interface Cube {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  maxPlayers?: number;
  createdAt: string;
}

interface PodPlayer {
  tournamentPlayer: {
    id: string;
    player: Player;
  };
}

interface Match {
  id: string;
  podId: string;
  swissRound: number;
  player1Id: string;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  isBye: boolean;
  reported: boolean;
}

interface Pod {
  id: string;
  podNumber: number;
  podSize: number;
  cube: { id: string; name: string; maxPlayers?: number };
  players: PodPlayer[];
  matches: Match[];
}

interface DraftPhoto {
  id: string;
  type: string;
  imageUrl: string;
  tournamentPlayer: { id: string; player: { name: string } };
}

interface Draft {
  id: string;
  roundNumber: number;
  status: string;
  pods: Pod[];
  photos?: DraftPhoto[];
}

interface Tournament {
  id: string;
  name: string;
  status: "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";
  joinCode: string;
  createdAt: string;
  players: TournamentPlayer[];
  cubes: Cube[];
  drafts: Draft[];
}

interface Standing {
  rank: number;
  tournamentPlayerId: string;
  playerName: string;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  omwPercent: number;
  gwPercent: number;
  ogwPercent: number;
  dropped: boolean;
}

interface VoteSummary {
  desired: number;
  neutral: number;
  avoid: number;
}

interface SimPodPlayer {
  playerId: string;
  name: string;
  originalVote: "DESIRED" | "NEUTRAL" | "AVOID";
  matchPointsBefore: number;
}

interface SimPodDetail {
  podNumber: number;
  cubeId: string;
  cubeName: string;
  playerCount: number;
  desiredVoters: number;
  neutralVoters: number;
  avoidVoters: number;
  players: SimPodPlayer[];
}

interface SimDraftDetail {
  draftNumber: number;
  pods: SimPodDetail[];
}

interface SimPlayerStanding {
  playerId: string;
  name: string;
  matchPoints: number;
  assignments: Array<{
    draftNumber: number;
    cubeId: string;
    cubeName: string;
    originalVote: "DESIRED" | "NEUTRAL" | "AVOID";
    podNumber: number;
  }>;
}

interface SimulationStats {
  totalPods: number;
  desiredAssignments: number;
  neutralAssignments: number;
  avoidAssignments: number;
  desiredRate: number;
  avoidRate: number;
  fallbacksUsed: number;
  warnings: string[];
  podSizesPerDraft: number[][];
  draftDetails: SimDraftDetail[];
  voteMatrix: Record<string, Record<string, "DESIRED" | "NEUTRAL" | "AVOID">>;
  cubes: { id: string; name: string }[];
  playerNames: Record<string, string>;
  finalStandings: SimPlayerStanding[];
}

// === Hilfskonstanten ===

type TournamentStatus = "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";

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




// === Hauptkomponente ===

export default function TournamentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  // Turnierdaten
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Drafts mit Match-Daten (separater Endpunkt für vollständige Daten)
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // Standings
  const [standings, setStandings] = useState<Standing[]>([]);

  // Vote-Zusammenfassung pro Spieler
  const [voteSummary, setVoteSummary] = useState<Record<string, VoteSummary>>({});

  // Cube-Modal
  const [showCubeModal, setShowCubeModal] = useState(false);
  const [cubeName, setCubeName] = useState("");
  const [cubeDesc, setCubeDesc] = useState("");
  const [cubeCreating, setCubeCreating] = useState(false);
  const [cubeMaxPlayers, setCubeMaxPlayers] = useState("");
  const [cubeError, setCubeError] = useState("");

  // Match-Ergebnis-Eingabe: matchId → { p1, p2 }
  const [matchInputs, setMatchInputs] = useState<Record<string, { p1: number; p2: number }>>({});
  const [reportingMatch, setReportingMatch] = useState<string | null>(null);

  // Phasen-Wechsel
  const [advancingPhase, setAdvancingPhase] = useState(false);

  // Simulation
  const [simPlayerCount, setSimPlayerCount] = useState("64");
  const [simCubeCount, setSimCubeCount] = useState("24");
  const [simSeed, setSimSeed] = useState("");
  const [simRunning, setSimRunning] = useState(false);
  const [simResults, setSimResults] = useState<SimulationStats | null>(null);
  const [simError, setSimError] = useState("");
  const [simTab, setSimTab] = useState<"overview" | "drafts" | "players" | "votes">("overview");

  // Aktionsstatus
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [generatingPairings, setGeneratingPairings] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [fillingRandomDraftId, setFillingRandomDraftId] = useState<string | null>(null);

  // Foto-Modal: Spieler-Fotos anzeigen (Draft + TournamentPlayer)
  const [photoModal, setPhotoModal] = useState<{
    draftId: string;
    tournamentPlayerId: string;
    playerName: string;
  } | null>(null);

  // Stimmen pro Cube: welche Zelle ist aufgeklappt (z. B. "cubeId-desired")
  const [votesExpandedCell, setVotesExpandedCell] = useState<string | null>(null);

  // === Daten laden ===

  const fetchTournament = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}`);
      if (!res.ok) {
        setError("Turnier konnte nicht geladen werden.");
        return;
      }
      const data: Tournament = await res.json();
      setTournament(data);
      setError("");
    } catch {
      setError("Verbindungsfehler.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts`);
      if (res.ok) {
        const data: Draft[] = await res.json();
        setDrafts(data);
      }
    } catch {
      // Stille Fehlerbehandlung
    }
  }, [id]);

  const fetchStandings = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${id}/standings`);
      if (res.ok) {
        const data: Standing[] = await res.json();
        setStandings(data);
      }
    } catch {
      // Stille Fehlerbehandlung
    }
  }, [id]);

  const fetchVoteSummary = useCallback(async (players: TournamentPlayer[]) => {
    const summaries: Record<string, VoteSummary> = {};
    await Promise.all(
      players.map(async (tp) => {
        try {
          const res = await fetch(`/api/tournaments/${id}/votes?playerId=${tp.player.id}`);
          if (res.ok) {
            const data = await res.json();
            const counts: VoteSummary = { desired: 0, neutral: 0, avoid: 0 };
            for (const v of data.votes) {
              if (v.vote === "DESIRED") counts.desired++;
              else if (v.vote === "AVOID") counts.avoid++;
              else counts.neutral++;
            }
            summaries[tp.id] = counts;
          }
        } catch {
          // Stille Fehlerbehandlung
        }
      })
    );
    setVoteSummary(summaries);
  }, [id]);

  // Initiales Laden
  useEffect(() => {
    fetchTournament();
    fetchDrafts();
    fetchStandings();
  }, [fetchTournament, fetchDrafts, fetchStandings]);

  // Votes laden, sobald Spielerdaten verfügbar
  useEffect(() => {
    if (tournament?.players && tournament.players.length > 0) {
      fetchVoteSummary(tournament.players);
    }
  }, [tournament?.players, fetchVoteSummary]);

  // Alle Daten neu laden
  const refreshAll = async () => {
    await Promise.all([fetchTournament(), fetchDrafts(), fetchStandings()]);
  };

  // === Aktionen ===

  // Spielernamen- und Standings-Lookup für Match-/Pod-Anzeige
  const playerNameMap: Record<string, string> = {};
  const playerStandingsMap: Record<string, { matchPoints: number }> = {};
  if (tournament) {
    for (const tp of tournament.players) {
      playerNameMap[tp.id] = tp.player.name;
      playerStandingsMap[tp.id] = { matchPoints: tp.matchPoints };
    }
  }

  const handleSetStatus = async (newStatus: TournamentStatus) => {
    if (!tournament) return;
    setAdvancingPhase(true);
    try {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await refreshAll();
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setAdvancingPhase(false);
    }
  };

  const handleAddCube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cubeName.trim()) return;
    setCubeCreating(true);
    setCubeError("");
    try {
      const res = await fetch(`/api/tournaments/${id}/cubes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cubeName.trim(),
          description: cubeDesc.trim(),
          maxPlayers: cubeMaxPlayers ? parseInt(cubeMaxPlayers, 10) : null
        }),
      });
      if (res.ok) {
        setShowCubeModal(false);
        setCubeName("");
        setCubeDesc("");
        setCubeMaxPlayers("");
        await fetchTournament();
      } else {
        const data = await res.json();
        setCubeError(data.error || "Fehler beim Erstellen.");
      }
    } catch {
      setCubeError("Verbindungsfehler.");
    } finally {
      setCubeCreating(false);
    }
  };

  const handleDeleteCube = async (cubeId: string) => {
    try {
      const res = await fetch(`/api/tournaments/${id}/cubes/${cubeId}`, { method: "DELETE" });
      if (res.ok) await fetchTournament();
    } catch {
      // Stille Fehlerbehandlung
    }
  };

  const handleGenerateDraft = async () => {
    setGeneratingDraft(true);
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts`, { method: "POST" });
      if (res.ok) await refreshAll();
      else {
        const data = await res.json();
        alert(data.error || "Draft konnte nicht generiert werden.");
      }
    } catch {
      alert("Verbindungsfehler.");
    } finally {
      setGeneratingDraft(false);
    }
  };

  const handleGeneratePairings = async (draftId: string) => {
    setGeneratingPairings(draftId);
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts/${draftId}/pairings`, { method: "POST" });
      if (res.ok) await fetchDrafts();
      else {
        const data = await res.json();
        alert(data.error || "Paarungen konnten nicht generiert werden.");
      }
    } catch {
      alert("Verbindungsfehler.");
    } finally {
      setGeneratingPairings(null);
    }
  };

  const handleRemoveDraft = async (draftId: string, roundNumber: number) => {
    if (!confirm(`Draft #${roundNumber} wirklich entfernen? Pods, Paarungen und Fotos werden gelöscht. Du kannst die Runde danach neu generieren.`)) return;
    setDeletingDraftId(draftId);
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts/${draftId}`, { method: "DELETE" });
      if (res.ok) await refreshAll();
      else {
        const data = await res.json();
        alert(data.error || "Draft konnte nicht gelöscht werden.");
      }
    } catch {
      alert("Verbindungsfehler.");
    } finally {
      setDeletingDraftId(null);
    }
  };

  const handleFillRoundRandomly = async (draftId: string) => {
    setFillingRandomDraftId(draftId);
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts/${draftId}/results/fill-random`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await Promise.all([fetchDrafts(), fetchStandings()]);
      } else {
        const data = await res.json();
        alert(data.error || "Ergebnisse konnten nicht gefüllt werden.");
      }
    } catch {
      alert("Verbindungsfehler.");
    } finally {
      setFillingRandomDraftId(null);
    }
  };

  const handleReportResult = async (
    draftId: string,
    matchId: string,
    match: { player1Wins: number; player2Wins: number }
  ) => {
    const input = matchInputs[matchId];
    const p1 = input?.p1 ?? match.player1Wins;
    const p2 = input?.p2 ?? match.player2Wins;
    setReportingMatch(matchId);
    try {
      const res = await fetch(`/api/tournaments/${id}/drafts/${draftId}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, player1Wins: p1, player2Wins: p2 }),
      });
      if (res.ok) {
        await Promise.all([fetchDrafts(), fetchStandings()]);
      } else {
        const data = await res.json();
        alert(data.error || "Ergebnis konnte nicht gemeldet werden.");
      }
    } catch {
      alert("Verbindungsfehler.");
    } finally {
      setReportingMatch(null);
    }
  };

  const updateMatchInput = (matchId: string, field: "p1" | "p2", value: number) => {
    setMatchInputs((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: value },
    }));
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimRunning(true);
    setSimError("");
    setSimResults(null);
    try {
      const body: Record<string, unknown> = {
        playerCount: parseInt(simPlayerCount) || 64,
        cubeCount: parseInt(simCubeCount) || 24,
      };
      if (simSeed.trim()) body.seed = parseInt(simSeed);

      const res = await fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSimResults(await res.json());
      } else {
        const data = await res.json();
        setSimError(data.error || "Simulation fehlgeschlagen.");
      }
    } catch {
      setSimError("Verbindungsfehler.");
    } finally {
      setSimRunning(false);
    }
  };

  // === Rendering ===

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="text-center py-12 px-8 max-w-sm">
          <p className="text-danger mb-4">{error || "Turnier nicht gefunden."}</p>
          <Link href="/admin">
            <Button variant="secondary">Zurück zur Übersicht</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const isSetup = tournament.status === "SETUP";
  const isVoting = tournament.status === "VOTING";
  const isDrafting = tournament.status === "DRAFTING";
  const isFinished = tournament.status === "FINISHED";

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* ===== KOPFZEILE ===== */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <Link href="/admin" className="text-sm text-muted hover:text-foreground transition-colors">
              ← Zurück zur Übersicht
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem("admin_password");
                router.push("/admin");
              }}
            >
              Abmelden
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{tournament.name}</h1>
              <Badge variant={STATUS_BADGE_VARIANT[tournament.status] ?? "default"}>
                {STATUS_LABEL[tournament.status] ?? tournament.status}
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              {/* Voting-Toggle: SETUP ↔ VOTING */}
              {(isSetup || isVoting) && (
                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                  <span className="text-sm text-muted">Voting</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isVoting}
                    disabled={advancingPhase}
                    onClick={() => handleSetStatus(isVoting ? "SETUP" : "VOTING")}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent cursor-pointer
                      disabled:opacity-50 disabled:cursor-not-allowed
                      ${isVoting ? "bg-accent" : "bg-border"}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform
                        ${isVoting ? "translate-x-5.5" : "translate-x-0.5"}`}
                    />
                  </button>
                </label>
              )}
              {/* Phasen-Buttons für spätere Übergänge (VOTING→DRAFTING, DRAFTING→FINISHED) */}
              {isVoting && (
                <Button onClick={() => handleSetStatus("DRAFTING")} loading={advancingPhase}>
                  Drafting starten
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              )}
              {isDrafting && (
                <Button onClick={() => handleSetStatus("FINISHED")} loading={advancingPhase} variant="danger">
                  Turnier beenden
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ===== CUBES ===== */}
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <h2 className="text-lg font-semibold">Cubes</h2>
              <span className="text-sm text-muted">({tournament.cubes.length})</span>
            </div>
            {isSetup && (
              <Button variant="secondary" size="sm" onClick={(e) => { e.preventDefault(); setShowCubeModal(true); }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Cube hinzufügen
              </Button>
            )}
          </summary>
          <div className="space-y-4 mt-4">

            {tournament.cubes.length === 0 ? (
              <Card className="text-center py-8 text-muted">Noch keine Cubes vorhanden.</Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tournament.cubes.map((cube) => (
                  <Card key={cube.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{cube.name}</p>
                        {cube.maxPlayers && (
                          <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground whitespace-nowrap" title={`Maximal ${cube.maxPlayers} Spieler`}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            {cube.maxPlayers}
                          </span>
                        )}
                      </div>
                      {cube.description && (
                        <p className="text-sm text-muted mt-1 line-clamp-2">{cube.description}</p>
                      )}
                    </div>
                    {isSetup && (
                      <button
                        onClick={() => handleDeleteCube(cube.id)}
                        className="text-muted hover:text-danger transition-colors shrink-0 cursor-pointer"
                        title="Cube entfernen"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* ===== SPIELER ===== */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
            <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <h2 className="text-lg font-semibold">Spieler</h2>
            <span className="text-sm text-muted">({tournament.players.length})</span>
          </summary>
          <div className="space-y-4 mt-4">

            {/* Beitritts-Code */}
            <Card className="flex flex-col sm:flex-row sm:items-center gap-3 bg-accent/5 border-accent/20">
              <div className="flex-1">
                <p className="text-sm text-muted mb-1">Beitritts-Code</p>
                <p className="text-2xl font-mono font-bold tracking-widest text-accent">{tournament.joinCode}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigator.clipboard.writeText(tournament.joinCode)}
              >
                Kopieren
              </Button>
            </Card>

            {tournament.players.length === 0 ? (
              <Card className="text-center py-8 text-muted">Noch keine Spieler angemeldet.</Card>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="text-left px-4 py-3 font-medium text-muted">Spieler</th>
                      <th className="text-center px-4 py-3 font-medium text-muted">Gewünscht</th>
                      <th className="text-center px-4 py-3 font-medium text-muted">Neutral</th>
                      <th className="text-center px-4 py-3 font-medium text-muted">Vermeiden</th>
                      <th className="text-center px-4 py-3 font-medium text-muted">Punkte</th>
                      <th className="text-right px-4 py-3 font-medium text-muted"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournament.players.map((tp) => {
                      const vs = voteSummary[tp.id];
                      return (
                        <tr key={tp.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                          <td className="px-4 py-3 font-medium">{tp.player.name}</td>
                          <td className="px-4 py-3 text-center">
                            {vs ? <span className="text-success">{vs.desired}</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {vs ? <span className="text-muted">{vs.neutral}</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {vs ? <span className="text-danger">{vs.avoid}</span> : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">{tp.matchPoints}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                localStorage.setItem(`tp_${id}`, tp.id);
                                localStorage.setItem(`player_${id}`, tp.player.id);
                                localStorage.setItem(`impersonating_${id}`, tp.player.name);
                                window.open(`/tournament/${id}`, "_blank");
                              }}
                              className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
                              title={`Als ${tp.player.name} anzeigen`}
                            >
                              <svg className="w-4 h-4 inline-block mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Ansicht
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        {/* ===== STIMMEN PRO CUBE ===== */}
        {tournament.cubes.length > 0 && (() => {
          const votesByCube: Record<string, { desired: string[]; neutral: string[]; avoid: string[] }> = {};
          for (const cube of tournament.cubes) {
            votesByCube[cube.id] = { desired: [], neutral: [], avoid: [] };
          }
          for (const tp of tournament.players) {
            const name = tp.player.name;
            for (const v of tp.votes ?? []) {
              const bucket = votesByCube[v.cubeId];
              if (!bucket) continue;
              if (v.vote === "DESIRED") bucket.desired.push(name);
              else if (v.vote === "AVOID") bucket.avoid.push(name);
              else bucket.neutral.push(name);
            }
          }
          const renderVoteCell = (
            cubeId: string,
            names: string[],
            type: "desired" | "neutral" | "avoid"
          ) => {
            const key = `${cubeId}-${type}`;
            const expanded = votesExpandedCell === key;
            const count = names.length;
            const colorClass = type === "desired" ? "text-success" : type === "avoid" ? "text-danger" : "text-muted";
            return (
              <td key={key} className={`px-4 py-3 align-top ${colorClass}`}>
                <button
                  type="button"
                  onClick={() => count > 0 && setVotesExpandedCell(expanded ? null : key)}
                  disabled={count === 0}
                  className="text-left w-full rounded px-1 -mx-1 py-0.5 hover:bg-card-hover focus:outline-none focus:ring-1 focus:ring-accent font-mono tabular-nums disabled:opacity-70 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  {count > 0 ? count : "—"}
                </button>
                {expanded && names.length > 0 && (
                  <div className="mt-1 text-xs font-normal break-words">{names.join(", ")}</div>
                )}
              </td>
            );
          };
          return (
            <details key="stimmen-pro-cube" className="group">
              <summary className="flex items-center gap-2 cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
                <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <h2 className="text-lg font-semibold">Stimmen pro Cube</h2>
              </summary>
              <div className="space-y-4 mt-4">
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-card">
                        <th className="text-left px-4 py-3 font-medium text-muted">Cube</th>
                        <th className="text-left px-4 py-3 font-medium text-success">👍 Gewünscht</th>
                        <th className="text-left px-4 py-3 font-medium text-muted">➖ Neutral</th>
                        <th className="text-left px-4 py-3 font-medium text-danger">👎 Vermeiden</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tournament.cubes.map((cube) => {
                        const vb = votesByCube[cube.id] ?? { desired: [], neutral: [], avoid: [] };
                        return (
                          <tr key={cube.id} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                            <td className="px-4 py-3 font-medium align-top">{cube.name}</td>
                            {renderVoteCell(cube.id, vb.desired, "desired")}
                            {renderVoteCell(cube.id, vb.neutral, "neutral")}
                            {renderVoteCell(cube.id, vb.avoid, "avoid")}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              </div>
            </details>
          );
        })()}

        {/* ===== DRAFTS (nur im Drafting-/Finished-Status sichtbar) ===== */}
        {(isDrafting || isFinished) && (
          <details className="group" open>
            <summary className="flex items-center justify-between cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                <h2 className="text-lg font-semibold">Drafts</h2>
                <span className="text-sm text-muted">({drafts.length})</span>
              </div>
              {isDrafting && (
                <Button onClick={(e) => { e.preventDefault(); handleGenerateDraft(); }} loading={generatingDraft}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Nächsten Draft generieren
                </Button>
              )}
            </summary>
            <div className="space-y-4 mt-4">

              {drafts.length === 0 ? (
                <Card className="text-center py-8 text-muted">Noch keine Drafts generiert.</Card>
              ) : (
                <div className="space-y-6">
                  {drafts.map((draft) => {
                    const draftPlayerIds = new Set(draft.pods.flatMap((p) => p.players.map((pp) => pp.tournamentPlayer.id)));
                    const expectedPhotos = draftPlayerIds.size * 3;
                    const actualPhotos = draft.photos?.length ?? 0;
                    const photosComplete = expectedPhotos > 0 && actualPhotos >= expectedPhotos;

                    return (
                      <details key={draft.id} className="group/draft" open>
                        <summary className="list-none cursor-pointer select-none [&::-webkit-details-marker]:hidden">
                          <Card className="space-y-0">
                            {/* Draft-Kopfzeile inkl. Foto-Indikator */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <svg className="w-4 h-4 text-muted transition-transform group-open/draft:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                <h3 className="font-semibold">Draft #{draft.roundNumber}</h3>
                                <span
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${photosComplete
                                    ? "bg-success/20 text-success"
                                    : expectedPhotos === 0
                                      ? "bg-muted/40 text-muted"
                                      : "bg-warning/20 text-warning"
                                    }`}
                                  title={expectedPhotos === 0 ? "Keine Spieler im Draft" : photosComplete ? "Alle Fotos hochgeladen" : `Fotos: ${actualPhotos}/${expectedPhotos}`}
                                >
                                  {expectedPhotos === 0 ? (
                                    "—"
                                  ) : photosComplete ? (
                                    <>
                                      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Alle Fotos
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 4v2h1v-2h-1zm-2-2v2h1V7h-1zm2 8v-2h-1v2h1zm-1-2v-2h-1v2h1zm-6 2v-2H7v2h1zm-2-2v-2H5v2h1z" clipRule="evenodd" />
                                      </svg>
                                      Fotos {actualPhotos}/{expectedPhotos}
                                    </>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {isDrafting && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleGeneratePairings(draft.id)}
                                    loading={generatingPairings === draft.id}
                                  >
                                    Paarungen generieren
                                  </Button>
                                )}
                                {draft.pods.some((p) => p.matches.some((m) => !m.reported)) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleFillRoundRandomly(draft.id)}
                                    loading={fillingRandomDraftId === draft.id}
                                    title="Nur die nächste Runde mit ungemeldeten Matches zufällig füllen"
                                  >
                                    Ergebnisse zufällig (diese Runde)
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveDraft(draft.id, draft.roundNumber)}
                                  loading={deletingDraftId === draft.id}
                                  className="text-muted hover:text-danger"
                                  title="Draft entfernen und Runde neu ausführen können"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  Draft entfernen
                                </Button>
                              </div>
                            </div>
                          </Card>
                        </summary>

                        {/* Pods */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {draft.pods.map((pod) => {
                            const podPlayerIds = new Set(pod.players.map((pp) => pp.tournamentPlayer.id));
                            const podPhotos = (draft.photos ?? []).filter((ph) => podPlayerIds.has(ph.tournamentPlayer.id));

                            return (
                              <div key={pod.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="accent">Pod {pod.podNumber}</Badge>
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm text-muted">{pod.cube.name}</span>
                                    {pod.cube.maxPlayers && (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1 rounded bg-muted/20 text-muted-foreground" title={`Max. ${pod.cube.maxPlayers} Spieler`}>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                        {pod.cube.maxPlayers}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                  {pod.players.map((pp) => {
                                    const tpId = pp.tournamentPlayer.id;
                                    const hasPool = podPhotos.some((ph) => ph.tournamentPlayer.id === tpId && ph.type === "POOL");
                                    const hasDeck = podPhotos.some((ph) => ph.tournamentPlayer.id === tpId && ph.type === "DECK");
                                    const hasReturn = podPhotos.some((ph) => ph.tournamentPlayer.id === tpId && ph.type === "RETURNED");
                                    const voteForCube = tournament?.players?.find((p) => p.id === tpId)?.votes?.find((v) => v.cubeId === pod.cube.id)?.vote ?? "NEUTRAL";
                                    const voteEmoji = voteForCube === "DESIRED" ? "👍" : voteForCube === "AVOID" ? "👎" : "➖";
                                    return (
                                      <button
                                        key={tpId}
                                        type="button"
                                        onClick={() => setPhotoModal({ draftId: draft.id, tournamentPlayerId: tpId, playerName: pp.tournamentPlayer.player.name })}
                                        className="flex items-center justify-between gap-2 text-left text-xs px-2 py-1.5 rounded bg-card border border-border hover:border-accent/50 hover:ring-1 hover:ring-accent/30 focus:outline-none focus:ring-2 focus:ring-accent"
                                      >
                                        <span className="font-medium truncate flex items-center gap-1">
                                          {pp.tournamentPlayer.player.name}
                                          <span className="text-muted font-normal">({playerStandingsMap[tpId]?.matchPoints ?? 0} Pkt)</span>
                                          <span title={voteForCube === "DESIRED" ? "Gewünscht" : voteForCube === "AVOID" ? "Vermeiden" : "Neutral"}>{voteEmoji}</span>
                                        </span>
                                        <span className="flex items-center gap-1 shrink-0 text-muted" title="Pool · Deck · Rückgabe">
                                          <span className={hasPool ? "text-success" : "text-muted/60"} title="Pool">{hasPool ? "✓" : "—"}</span>
                                          <span className={hasDeck ? "text-success" : "text-muted/60"} title="Deck">{hasDeck ? "✓" : "—"}</span>
                                          <span className={hasReturn ? "text-success" : "text-muted/60"} title="Rückgabe">{hasReturn ? "✓" : "—"}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Matches in diesem Pod — grouped by Swiss round */}
                                {pod.matches.length > 0 && (() => {
                                  const roundNumbers = [...new Set(pod.matches.map((m) => m.swissRound))].sort((a, b) => a - b);
                                  return roundNumbers.map((roundNum) => {
                                    const roundMatches = pod.matches.filter((m) => m.swissRound === roundNum);
                                    const allReported = roundMatches.every((m) => m.reported);
                                    return (
                                      <details key={roundNum} className="group/round mt-3 border-t border-border pt-3">
                                        <summary className="flex items-center gap-2 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden text-xs">
                                          <svg className="w-3 h-3 text-muted transition-transform group-open/round:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                          <span className="font-medium text-muted uppercase tracking-wide">Runde {roundNum}</span>
                                          {allReported && <Badge variant="success">✓</Badge>}
                                        </summary>
                                        <div className="space-y-2 mt-2">
                                          {roundMatches.map((match) => {
                                            const p1Name = playerNameMap[match.player1Id] ?? "?";
                                            const p2Name = match.player2Id ? (playerNameMap[match.player2Id] ?? "?") : null;
                                            const input = matchInputs[match.id] ?? { p1: match.player1Wins, p2: match.player2Wins };

                                            const p1Pts = playerStandingsMap[match.player1Id]?.matchPoints;
                                            const p2Pts = match.player2Id ? playerStandingsMap[match.player2Id]?.matchPoints : undefined;
                                            if (match.isBye) {
                                              return (
                                                <div key={match.id} className="flex items-center gap-2 text-sm text-muted">
                                                  <span>{p1Name}{p1Pts != null ? ` (${p1Pts} Pkt)` : ""}</span>
                                                  <Badge variant="default">Bye</Badge>
                                                </div>
                                              );
                                            }

                                            return (
                                              <div key={match.id} className="flex flex-wrap items-center gap-2 text-sm">
                                                {/* Runden-Nummer */}
                                                <span className="text-xs text-muted w-8 shrink-0">R{match.swissRound}</span>

                                                {/* Spieler 1 */}
                                                <span className="font-medium min-w-[80px]">{p1Name}{p1Pts != null ? ` (${p1Pts})` : ""}</span>

                                                {/* Eingabe Spieler 1 Siege */}
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={2}
                                                  className="w-12 rounded border border-border bg-card px-2 py-1 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                                                  value={input.p1 ?? match.player1Wins}
                                                  onChange={(e) => updateMatchInput(match.id, "p1", parseInt(e.target.value, 10) || 0)}
                                                />
                                                <span className="text-muted">:</span>
                                                {/* Eingabe Spieler 2 Siege */}
                                                <input
                                                  type="number"
                                                  min={0}
                                                  max={2}
                                                  className="w-12 rounded border border-border bg-card px-2 py-1 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                                                  value={input.p2 ?? match.player2Wins}
                                                  onChange={(e) => updateMatchInput(match.id, "p2", parseInt(e.target.value, 10) || 0)}
                                                />

                                                {/* Spieler 2 */}
                                                <span className="font-medium min-w-[80px]">{p2Name}{p2Pts != null ? ` (${p2Pts})` : ""}</span>

                                                {/* Status / Aktion */}
                                                {match.reported ? (
                                                  <Badge variant="success">Gemeldet</Badge>
                                                ) : null}
                                                <Button
                                                  variant={match.reported ? "ghost" : "primary"}
                                                  size="sm"
                                                  onClick={() => handleReportResult(draft.id, match.id, match)}
                                                  loading={reportingMatch === match.id}
                                                >
                                                  {match.reported ? "Aktualisieren" : "Melden"}
                                                </Button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </details>
                                    );
                                  });
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        )}

        {/* ===== STANDINGS ===== */}
        <details className="group">
          <summary className="flex items-center justify-between cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <h2 className="text-lg font-semibold">Standings</h2>
              {standings.length > 0 && <span className="text-sm text-muted">({standings.length})</span>}
            </div>
            <Button variant="ghost" size="sm" onClick={(e) => { e.preventDefault(); fetchStandings(); }}>
              Aktualisieren
            </Button>
          </summary>
          <div className="space-y-4 mt-4">

            {standings.length === 0 ? (
              <Card className="text-center py-8 text-muted">Noch keine Ergebnisse vorhanden.</Card>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-card">
                      <th className="text-center px-3 py-3 font-medium text-muted">#</th>
                      <th className="text-left px-3 py-3 font-medium text-muted">Spieler</th>
                      <th className="text-center px-3 py-3 font-medium text-muted">Punkte</th>
                      <th className="text-center px-3 py-3 font-medium text-muted">Bilanz</th>
                      <th className="text-center px-3 py-3 font-medium text-muted">OMW%</th>
                      <th className="text-center px-3 py-3 font-medium text-muted">GW%</th>
                      <th className="text-center px-3 py-3 font-medium text-muted">OGW%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s) => (
                      <tr key={s.tournamentPlayerId} className="border-b border-border last:border-0 hover:bg-card-hover transition-colors">
                        <td className="px-3 py-3 text-center font-mono text-muted">{s.rank}</td>
                        <td className="px-3 py-3 font-medium">
                          {s.playerName}
                          {s.dropped && <span className="text-danger text-xs ml-2">(dropped)</span>}
                        </td>
                        <td className="px-3 py-3 text-center font-mono font-semibold">{s.matchPoints}</td>
                        <td className="px-3 py-3 text-center text-muted">
                          {s.matchWins}-{s.matchLosses}-{s.matchDraws}
                        </td>
                        <td className="px-3 py-3 text-center font-mono">{s.omwPercent.toFixed(2)}%</td>
                        <td className="px-3 py-3 text-center font-mono">{s.gwPercent.toFixed(2)}%</td>
                        <td className="px-3 py-3 text-center font-mono">{s.ogwPercent.toFixed(2)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>

        {/* ===== SIMULATION ===== */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none py-2 select-none [&::-webkit-details-marker]:hidden">
            <svg className="w-4 h-4 text-muted transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            <h2 className="text-lg font-semibold">Simulation</h2>
          </summary>
          <div className="space-y-4 mt-4">
            <Card>
              <form onSubmit={handleRunSimulation} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    id="sim-players"
                    label="Spieleranzahl"
                    type="number"
                    min={2}
                    max={1000}
                    value={simPlayerCount}
                    onChange={(e) => setSimPlayerCount(e.target.value)}
                  />
                  <Input
                    id="sim-cubes"
                    label="Cube-Anzahl"
                    type="number"
                    min={1}
                    max={200}
                    value={simCubeCount}
                    onChange={(e) => setSimCubeCount(e.target.value)}
                  />
                  <Input
                    id="sim-seed"
                    label="Seed (optional)"
                    type="number"
                    placeholder="Zufällig"
                    value={simSeed}
                    onChange={(e) => setSimSeed(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <Button type="submit" loading={simRunning}>
                    Simulation starten
                  </Button>
                  {simError && <p className="text-sm text-danger">{simError}</p>}
                </div>
              </form>
            </Card>

            {simResults && (
              <SimulationResults
                stats={simResults}
                activeTab={simTab}
                onTabChange={setSimTab}
              />
            )}
          </div>
        </details>
      </div>

      {/* ===== MODAL: Cube hinzufügen ===== */}
      <Modal open={showCubeModal} onClose={() => setShowCubeModal(false)} title="Cube hinzufügen">
        <form onSubmit={handleAddCube} className="space-y-4">
          <Input
            id="cube-name"
            label="Name"
            placeholder="z.B. Vintage Cube"
            value={cubeName}
            onChange={(e) => setCubeName(e.target.value)}
            error={cubeError}
            autoFocus
          />
          <Input
            id="cube-desc"
            label="Beschreibung (optional)"
            placeholder="Kurze Beschreibung des Cubes"
            value={cubeDesc}
            onChange={(e) => setCubeDesc(e.target.value)}
          />
          <Input
            id="cube-max-players"
            label="Max. Spieler (optional)"
            placeholder="z.B. 8 (leer = unbegrenzt)"
            type="number"
            min="2"
            value={cubeMaxPlayers}
            onChange={(e) => setCubeMaxPlayers(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" type="button" onClick={() => setShowCubeModal(false)}>
              Abbrechen
            </Button>
            <Button type="submit" loading={cubeCreating}>
              Hinzufügen
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Fotos eines Spielers (Pool, Deck, Rückgabe) */}
      <Modal
        open={!!photoModal}
        onClose={() => setPhotoModal(null)}
        title={photoModal ? `Fotos — ${photoModal.playerName}` : ""}
      >
        {photoModal && (() => {
          const draft = drafts.find((d) => d.id === photoModal.draftId);
          const playerPhotos = (draft?.photos ?? []).filter(
            (p) => p.tournamentPlayer.id === photoModal.tournamentPlayerId
          );
          const types = [
            { key: "POOL", label: "Pool" },
            { key: "DECK", label: "Deck" },
            { key: "RETURNED", label: "Rückgabe" },
          ] as const;
          return (
            <div className="space-y-4">
              {types.map(({ key, label }) => {
                const photo = playerPhotos.find((p) => p.type === key);
                return (
                  <div key={key}>
                    <p className="text-xs font-medium text-muted mb-1">{label}</p>
                    {photo ? (
                      <a
                        href={photo.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-lg border border-border overflow-hidden bg-card hover:ring-2 hover:ring-accent"
                      >
                        <img
                          src={photo.imageUrl}
                          alt={label}
                          className="w-full max-h-64 object-contain object-top"
                        />
                      </a>
                    ) : (
                      <p className="text-sm text-muted py-4 text-center rounded-lg border border-dashed border-border">
                        Nicht hochgeladen
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setPhotoModal(null)}>
                  Schließen
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

// === Hilfskomponenten ===

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "danger" | "warning";
}) {
  const colorClass = accent === "success"
    ? "text-success"
    : accent === "danger"
      ? "text-danger"
      : accent === "warning"
        ? "text-warning"
        : "text-foreground";

  return (
    <div className="rounded-lg bg-background border border-border p-3">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={`text-lg font-semibold font-mono ${colorClass}`}>{value}</p>
    </div>
  );
}

function VoteIcon({ vote }: { vote: "DESIRED" | "NEUTRAL" | "AVOID" }) {
  if (vote === "DESIRED") return <span className="text-success" title="Gewünscht">👍</span>;
  if (vote === "AVOID") return <span className="text-danger" title="Vermeiden">👎</span>;
  return <span className="text-muted" title="Neutral">➖</span>;
}

function VoteBadge({ vote }: { vote: "DESIRED" | "NEUTRAL" | "AVOID" }) {
  const styles = {
    DESIRED: "bg-success/15 text-success",
    NEUTRAL: "bg-border text-muted",
    AVOID: "bg-danger/15 text-danger",
  };
  const labels = { DESIRED: "Gewünscht", NEUTRAL: "Neutral", AVOID: "Vermeiden" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[vote]}`}>
      <VoteIcon vote={vote} /> {labels[vote]}
    </span>
  );
}

// === Simulations-Ergebnis-Ansicht ===

type SimTabId = "overview" | "drafts" | "players" | "votes";

const SIM_TABS: { id: SimTabId; label: string }[] = [
  { id: "overview", label: "Übersicht" },
  { id: "drafts", label: "Drafts & Pods" },
  { id: "players", label: "Spieler" },
  { id: "votes", label: "Stimmen-Matrix" },
];

function SimulationResults({
  stats,
  activeTab,
  onTabChange,
}: {
  stats: SimulationStats;
  activeTab: SimTabId;
  onTabChange: (tab: SimTabId) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Tab-Leiste */}
      <div className="flex gap-1 rounded-lg bg-card border border-border p-1">
        {SIM_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors cursor-pointer
              ${activeTab === tab.id
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground hover:bg-card-hover"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && <SimOverviewTab stats={stats} />}
      {activeTab === "drafts" && <SimDraftsTab stats={stats} />}
      {activeTab === "players" && <SimPlayersTab stats={stats} />}
      {activeTab === "votes" && <SimVotesTab stats={stats} />}
    </div>
  );
}

// --- Tab: Übersicht ---
function SimOverviewTab({ stats }: { stats: SimulationStats }) {
  return (
    <Card className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatBox label="Pods gesamt" value={stats.totalPods} />
        <StatBox label="Spieler" value={stats.finalStandings.length} />
        <StatBox label="Cubes" value={stats.cubes.length} />
        <StatBox label="Fallbacks" value={stats.fallbacksUsed} accent="warning" />
      </div>

      {/* Zuweisungs-Balken */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted">Cube-Zuweisungen</p>
        <div className="flex rounded-full overflow-hidden h-6 bg-border">
          {stats.desiredRate > 0 && (
            <div
              className="bg-success flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${stats.desiredRate * 100}%` }}
              title={`Gewünscht: ${stats.desiredAssignments}`}
            >
              {stats.desiredAssignments}
            </div>
          )}
          {(1 - stats.desiredRate - stats.avoidRate) > 0 && (
            <div
              className="bg-muted/40 flex items-center justify-center text-[10px] font-bold text-foreground"
              style={{ width: `${(1 - stats.desiredRate - stats.avoidRate) * 100}%` }}
              title={`Neutral: ${stats.neutralAssignments}`}
            >
              {stats.neutralAssignments}
            </div>
          )}
          {stats.avoidRate > 0 && (
            <div
              className="bg-danger flex items-center justify-center text-[10px] font-bold text-white"
              style={{ width: `${Math.max(stats.avoidRate * 100, 3)}%` }}
              title={`Vermieden: ${stats.avoidAssignments}`}
            >
              {stats.avoidAssignments}
            </div>
          )}
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>👍 {(stats.desiredRate * 100).toFixed(1)}% Gewünscht</span>
          <span>👎 {(stats.avoidRate * 100).toFixed(1)}% Vermieden</span>
        </div>
      </div>

      {stats.warnings.length > 0 && (
        <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
          <p className="text-sm font-medium text-warning mb-1">Warnungen ({stats.warnings.length})</p>
          <ul className="text-sm text-warning/80 space-y-1 max-h-40 overflow-y-auto">
            {stats.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// --- Tab: Drafts & Pods ---
function SimDraftsTab({ stats }: { stats: SimulationStats }) {
  return (
    <div className="space-y-6">
      {stats.draftDetails.map((draft) => (
        <Card key={draft.draftNumber} className="space-y-4">
          <h3 className="font-semibold text-base">Draft {draft.draftNumber}</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {draft.pods.map((pod) => (
              <div key={pod.podNumber} className="rounded-lg border border-border bg-background p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="accent">Pod {pod.podNumber}</Badge>
                    <span className="text-sm font-medium">{pod.cubeName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-success">👍{pod.desiredVoters}</span>
                    <span className="text-muted">➖{pod.neutralVoters}</span>
                    <span className="text-danger">👎{pod.avoidVoters}</span>
                  </div>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted border-b border-border">
                      <th className="text-left py-1 font-medium">Spieler</th>
                      <th className="text-center py-1 font-medium w-16">Punkte</th>
                      <th className="text-center py-1 font-medium w-16">Stimme</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pod.players.map((p) => (
                      <tr key={p.playerId} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5">{p.name}</td>
                        <td className="py-1.5 text-center font-mono text-muted">{p.matchPointsBefore}</td>
                        <td className="py-1.5 text-center"><VoteIcon vote={p.originalVote} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// --- Tab: Spieler ---
function SimPlayersTab({ stats }: { stats: SimulationStats }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-center px-3 py-2 font-medium text-muted w-10">#</th>
            <th className="text-left px-3 py-2 font-medium text-muted">Spieler</th>
            <th className="text-center px-3 py-2 font-medium text-muted w-16">Punkte</th>
            {stats.draftDetails.map((d) => (
              <th key={d.draftNumber} className="text-center px-3 py-2 font-medium text-muted">
                Draft {d.draftNumber}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {stats.finalStandings.map((player, idx) => (
            <tr key={player.playerId} className="border-b border-border/50 last:border-0 hover:bg-card-hover transition-colors">
              <td className="px-3 py-2 text-center font-mono text-muted text-xs">{idx + 1}</td>
              <td className="px-3 py-2 font-medium">{player.name}</td>
              <td className="px-3 py-2 text-center font-mono font-semibold">{player.matchPoints}</td>
              {player.assignments.map((a) => (
                <td key={a.draftNumber} className="px-3 py-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs text-muted">{a.cubeName}</span>
                    <VoteIcon vote={a.originalVote} />
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// --- Tab: Stimmen-Matrix ---
type VotesSortKey = "points" | "name" | "desired" | "avoid" | "manual";

function SimVotesTab({ stats }: { stats: SimulationStats }) {
  const [sortBy, setSortBy] = useState<VotesSortKey>("points");
  const [sortAsc, setSortAsc] = useState(true);
  const [manualOrder, setManualOrder] = useState<string[]>([]);

  // Summen pro Cube (Spalte) über ALLE Spieler berechnen
  const cubeSums: Record<string, { d: number; n: number; a: number }> = {};
  for (const cube of stats.cubes) {
    cubeSums[cube.id] = { d: 0, n: 0, a: 0 };
  }
  for (const pid of Object.keys(stats.voteMatrix)) {
    const votes = stats.voteMatrix[pid];
    for (const cube of stats.cubes) {
      const v = votes[cube.id] ?? "NEUTRAL";
      if (v === "DESIRED") cubeSums[cube.id].d++;
      else if (v === "AVOID") cubeSums[cube.id].a++;
      else cubeSums[cube.id].n++;
    }
  }

  // Summen pro Spieler (Zeile)
  function playerSums(playerId: string) {
    const votes = stats.voteMatrix[playerId] ?? {};
    let d = 0, n = 0, a = 0;
    for (const cube of stats.cubes) {
      const v = votes[cube.id] ?? "NEUTRAL";
      if (v === "DESIRED") d++;
      else if (v === "AVOID") a++;
      else n++;
    }
    return { d, n, a };
  }

  const baseIds = stats.finalStandings.map((p) => p.playerId);
  const sortedPlayerIds = (() => {
    if (sortBy === "manual") {
      if (manualOrder.length !== baseIds.length) {
        const manualSet = new Set(manualOrder);
        const rest = baseIds.filter((id) => !manualSet.has(id));
        return [...manualOrder, ...rest];
      }
      return manualOrder.length ? manualOrder : baseIds;
    }
    const dir = sortAsc ? 1 : -1;
    return [...baseIds].sort((a, b) => {
      const standingA = stats.finalStandings.find((s) => s.playerId === a);
      const standingB = stats.finalStandings.find((s) => s.playerId === b);
      const sumsA = playerSums(a);
      const sumsB = playerSums(b);
      let cmp = 0;
      if (sortBy === "points") {
        cmp = (standingA?.matchPoints ?? 0) - (standingB?.matchPoints ?? 0);
      } else if (sortBy === "name") {
        cmp = (stats.playerNames[a] ?? "").localeCompare(stats.playerNames[b] ?? "");
      } else if (sortBy === "desired") {
        cmp = sumsA.d - sumsB.d;
      } else {
        cmp = sumsA.a - sumsB.a;
      }
      return dir * cmp;
    });
  })();

  const moveRow = (index: number, delta: number) => {
    const next = [...(manualOrder.length === baseIds.length ? manualOrder : sortedPlayerIds)];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setManualOrder(next);
    setSortBy("manual");
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          Alle {stats.finalStandings.length} Spieler, originale Stimmen (Zeilen) pro Cube (Spalten).
        </p>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-muted">Sortierung:</label>
          <select
            value={sortBy}
            onChange={(e) => {
              const v = e.target.value as VotesSortKey;
              setSortBy(v);
              if (v === "manual") setManualOrder([...baseIds]);
            }}
            className="text-xs bg-background border border-border rounded px-2 py-1"
          >
            <option value="points">Punkte</option>
            <option value="name">Name</option>
            <option value="desired">👍 Gewünscht</option>
            <option value="avoid">👎 Vermeiden</option>
            <option value="manual">Manuell (Auf/Ab)</option>
          </select>
          {sortBy !== "manual" && (
            <button
              type="button"
              onClick={() => setSortAsc((a) => !a)}
              className="text-xs bg-background border border-border rounded px-2 py-1 hover:bg-card-hover"
              title={sortAsc ? "Aufsteigend" : "Absteigend"}
            >
              {sortAsc ? "↑" : "↓"}
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-medium text-muted border-b border-r border-border min-w-[100px]">
                Spieler
              </th>
              {stats.cubes.map((cube) => (
                <th
                  key={cube.id}
                  className="px-1.5 py-1.5 text-center font-medium text-muted border-b border-border min-w-[32px]"
                  title={cube.name}
                >
                  <span className="writing-mode-vertical whitespace-nowrap block max-w-[32px] overflow-hidden text-ellipsis">
                    {cube.name.replace("Cube ", "C")}
                  </span>
                </th>
              ))}
              <th className="px-1.5 py-1.5 text-center font-medium text-success border-b border-l border-border min-w-[28px]" title="Gewünscht">👍</th>
              <th className="px-1.5 py-1.5 text-center font-medium text-muted border-b border-border min-w-[28px]" title="Neutral">➖</th>
              <th className="px-1.5 py-1.5 text-center font-medium text-danger border-b border-border min-w-[28px]" title="Vermeiden">👎</th>
            </tr>
          </thead>
          <tbody>
            {sortedPlayerIds.map((playerId, index) => {
              const playerVotes = stats.voteMatrix[playerId] ?? {};
              const standing = stats.finalStandings.find((s) => s.playerId === playerId);
              const sums = playerSums(playerId);
              return (
                <tr key={playerId} className="border-b border-border/30 hover:bg-card-hover transition-colors">
                  <td className="sticky left-0 z-10 bg-card px-2 py-1 font-medium border-r border-border whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {sortBy === "manual" && (
                        <span className="flex flex-col">
                          <button
                            type="button"
                            onClick={() => moveRow(index, -1)}
                            disabled={index === 0}
                            className="text-muted hover:text-foreground disabled:opacity-30 leading-none"
                            title="Nach oben"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveRow(index, 1)}
                            disabled={index === sortedPlayerIds.length - 1}
                            className="text-muted hover:text-foreground disabled:opacity-30 leading-none"
                            title="Nach unten"
                          >
                            ▼
                          </button>
                        </span>
                      )}
                      {stats.playerNames[playerId]}
                      <span className="text-muted ml-1 font-mono">({standing?.matchPoints ?? 0})</span>
                    </div>
                  </td>
                  {stats.cubes.map((cube) => {
                    const vote = playerVotes[cube.id] ?? "NEUTRAL";
                    const assignment = standing?.assignments.find((a) => a.cubeId === cube.id);
                    const cellBg = assignment
                      ? vote === "DESIRED"
                        ? "bg-success/20"
                        : vote === "AVOID"
                          ? "bg-danger/20"
                          : "bg-accent/10"
                      : "";
                    return (
                      <td
                        key={cube.id}
                        className={`px-1.5 py-1 text-center border-border/30 ${cellBg}`}
                        title={`${stats.playerNames[playerId]} → ${cube.name}: ${vote}${assignment ? " (zugewiesen in Draft " + assignment.draftNumber + ")" : ""}`}
                      >
                        {vote === "DESIRED" ? "👍" : vote === "AVOID" ? "👎" : "·"}
                        {assignment && <span className="block text-[9px] text-accent font-bold">D{assignment.draftNumber}</span>}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1 text-center font-mono text-success border-l border-border">{sums.d}</td>
                  <td className="px-1.5 py-1 text-center font-mono text-muted">{sums.n}</td>
                  <td className="px-1.5 py-1 text-center font-mono text-danger">{sums.a}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-card/80 font-medium">
              <td className="sticky left-0 z-10 bg-card px-2 py-1.5 border-r border-border text-muted">
                👍 Summe
              </td>
              {stats.cubes.map((cube) => (
                <td key={cube.id} className="px-1.5 py-1 text-center font-mono text-success">
                  {cubeSums[cube.id].d}
                </td>
              ))}
              <td className="px-1.5 py-1 text-center border-l border-border" />
              <td className="px-1.5 py-1 text-center" />
              <td className="px-1.5 py-1 text-center" />
            </tr>
            <tr className="bg-card/80 font-medium">
              <td className="sticky left-0 z-10 bg-card px-2 py-1.5 border-r border-border text-muted">
                👎 Summe
              </td>
              {stats.cubes.map((cube) => (
                <td key={cube.id} className="px-1.5 py-1 text-center font-mono text-danger">
                  {cubeSums[cube.id].a}
                </td>
              ))}
              <td className="px-1.5 py-1 text-center border-l border-border" />
              <td className="px-1.5 py-1 text-center" />
              <td className="px-1.5 py-1 text-center" />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
