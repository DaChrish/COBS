"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ImpersonationBanner from "@/components/ImpersonationBanner";

interface PlayerInfo {
  id: string;
  name: string;
}

interface TournamentPlayer {
  id: string;
  playerId: string;
  matchPoints: number;
  dropped: boolean;
  player: PlayerInfo;
}

interface PodPlayer {
  tournamentPlayerId: string;
  tournamentPlayer: TournamentPlayer;
}

interface Pod {
  id: string;
  podNumber: number;
  cube: { id: string; name: string };
  players: PodPlayer[];
}

interface Draft {
  id: string;
  roundNumber: number;
  status: string;
  pods: Pod[];
}

interface Tournament {
  id: string;
  name: string;
  status: string;
  date: string;
  joinCode: string;
  players: TournamentPlayer[];
  cubes: { id: string; name: string }[];
  drafts: Draft[];
}

const statusLabels: Record<string, { label: string; variant: "default" | "accent" | "warning" | "success" }> = {
  SETUP: { label: "Einrichtung", variant: "default" },
  VOTING: { label: "Abstimmung", variant: "accent" },
  DRAFTING: { label: "Drafting", variant: "warning" },
  FINISHED: { label: "Beendet", variant: "success" },
};

// Hauptseite für einen Turnier-Teilnehmer
export default function TournamentPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tpId, setTpId] = useState<string | null>(null);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  useEffect(() => {
    setTpId(localStorage.getItem(`tp_${id}`));
    setHasCheckedStorage(true);
  }, [id]);

  useEffect(() => {
    if (!hasCheckedStorage) return;
    if (!tpId) {
      router.push("/join");
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/tournaments/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTournament(data);
      } catch {
        setError("Turnier konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, tpId, hasCheckedStorage, router]);

  if (!tpId) return null;

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
        <Card className="text-center max-w-sm w-full">
          <p className="text-danger mb-4">{error || "Turnier nicht gefunden."}</p>
          <Link href="/join">
            <Button variant="secondary">Zurück</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const myPlayer = tournament.players.find((p) => p.id === tpId);
  const statusInfo = statusLabels[tournament.status] ?? statusLabels.SETUP;

  // Aktiven Draft ermitteln (für DRAFTING-Phase)
  const activeDraft = tournament.drafts.find((d) => d.status === "ACTIVE");
  const myPod = activeDraft?.pods.find((pod) =>
    pod.players.some((pp) => pp.tournamentPlayerId === tpId)
  );

  return (
    <div className="min-h-screen">
      <ImpersonationBanner tournamentId={id} />
      <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight leading-tight">
            {tournament.name}
          </h1>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
        </div>
        {myPlayer && (
          <p className="text-muted text-sm mt-1">
            Eingeloggt als <span className="text-foreground font-medium">{myPlayer.player.name}</span>
          </p>
        )}
      </div>

      {/* Übersicht */}
      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold">{tournament.players.length}</p>
            <p className="text-xs text-muted">Spieler</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{tournament.cubes.length}</p>
            <p className="text-xs text-muted">Cubes</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{tournament.drafts.length}</p>
            <p className="text-xs text-muted">Runden</p>
          </div>
        </div>
      </Card>

      {/* Status-spezifische CTA */}
      {tournament.status === "VOTING" && (
        <Link href={`/tournament/${id}/vote`} className="block mb-4">
          <Card hover className="border-accent/40 bg-accent/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Jetzt abstimmen!</p>
                <p className="text-sm text-muted">Bewerte die Cubes für das Turnier</p>
              </div>
              <span className="text-2xl">🗳️</span>
            </div>
          </Card>
        </Link>
      )}

      {tournament.status === "DRAFTING" && activeDraft && (
        <Link href={`/tournament/${id}/draft/${activeDraft.roundNumber}`} className="block mb-4">
          <Card hover className="border-warning/40 bg-warning/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Runde {activeDraft.roundNumber} läuft</p>
                {myPod && (
                  <p className="text-sm text-muted">
                    Pod {myPod.podNumber} — {myPod.cube.name}
                  </p>
                )}
              </div>
              <span className="text-2xl">⚔️</span>
            </div>
          </Card>
        </Link>
      )}

      {/* Spieler-Statistik */}
      {myPlayer && tournament.status !== "SETUP" && (
        <Card className="mb-4">
          <h2 className="text-sm font-semibold text-muted mb-3">Deine Statistik</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-background p-3">
              <p className="text-lg font-bold">{myPlayer.matchPoints}</p>
              <p className="text-xs text-muted">Match-Punkte</p>
            </div>
            <div className="rounded-lg bg-background p-3">
              <p className="text-lg font-bold">
                {myPlayer.dropped ? (
                  <span className="text-danger">Dropped</span>
                ) : (
                  <span className="text-success">Aktiv</span>
                )}
              </p>
              <p className="text-xs text-muted">Status</p>
            </div>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex flex-col gap-2">
        <Link href={`/tournament/${id}/vote`}>
          <Card hover className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">🗳️</span>
              <span className="font-medium">Cube-Abstimmung</span>
            </div>
            <ChevronRight />
          </Card>
        </Link>

        {tournament.drafts.map((draft) => (
          <Link key={draft.id} href={`/tournament/${id}/draft/${draft.roundNumber}`}>
            <Card hover className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">⚔️</span>
                <div>
                  <span className="font-medium">Runde {draft.roundNumber}</span>
                  <Badge
                    variant={draft.status === "ACTIVE" ? "warning" : draft.status === "FINISHED" ? "success" : "default"}
                    className="ml-2"
                  >
                    {draft.status === "ACTIVE" ? "Aktiv" : draft.status === "FINISHED" ? "Fertig" : "Geplant"}
                  </Badge>
                </div>
              </div>
              <ChevronRight />
            </Card>
          </Link>
        ))}

        <Link href={`/tournament/${id}/standings`}>
          <Card hover className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-lg">🏆</span>
              <span className="font-medium">Standings</span>
            </div>
            <ChevronRight />
          </Card>
        </Link>
      </div>
      </div>
    </div>
  );
}

function ChevronRight() {
  return (
    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
