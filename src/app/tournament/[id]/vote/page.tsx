"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ImpersonationBanner from "@/components/ImpersonationBanner";

type VoteType = "DESIRED" | "NEUTRAL" | "AVOID";

interface CubeVote {
  id: string;
  cubeId: string;
  vote: VoteType;
  cube: {
    id: string;
    name: string;
    description: string;
    imageUrl: string | null;
  };
}

const voteOptions: { value: VoteType; emoji: string; label: string; activeClass: string }[] = [
  { value: "DESIRED", emoji: "👍", label: "Gewünscht", activeClass: "bg-success/20 border-success text-success ring-2 ring-success/40" },
  { value: "NEUTRAL", emoji: "➖", label: "Neutral", activeClass: "bg-border/60 border-muted text-foreground ring-2 ring-muted/40" },
  { value: "AVOID", emoji: "👎", label: "Vermeiden", activeClass: "bg-danger/20 border-danger text-danger ring-2 ring-danger/40" },
];

// Abstimmungsseite: Spieler bewerten verfügbare Cubes
export default function VotePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [votes, setVotes] = useState<CubeVote[]>([]);
  const [tournamentPlayerId, setTournamentPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [tpId, setTpId] = useState<string | null>(null);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  useEffect(() => {
    setPlayerId(localStorage.getItem(`player_${id}`));
    setTpId(localStorage.getItem(`tp_${id}`));
    setHasCheckedStorage(true);
  }, [id]);

  useEffect(() => {
    if (!hasCheckedStorage) return;
    if (!tpId || !playerId) {
      router.push("/join");
      return;
    }

    async function load() {
      try {
        const res = await fetch(`/api/tournaments/${id}/votes?playerId=${playerId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setTournamentPlayerId(data.tournamentPlayerId);
        setVotes(data.votes);
      } catch {
        setError("Votes konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, playerId, tpId, hasCheckedStorage, router]);

  // Einzelnen Vote speichern (optimistisch)
  const handleVote = useCallback(
    async (cubeId: string, vote: VoteType) => {
      if (!tournamentPlayerId) return;

      setSaving(cubeId);

      // Optimistisches Update
      setVotes((prev) =>
        prev.map((v) => (v.cubeId === cubeId ? { ...v, vote } : v))
      );

      try {
        const res = await fetch(`/api/tournaments/${id}/votes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tournamentPlayerId,
            votes: [{ cubeId, vote }],
          }),
        });

        if (!res.ok) {
          throw new Error();
        }
      } catch {
        // Bei Fehler zurücksetzen
        setVotes((prev) =>
          prev.map((v) => (v.cubeId === cubeId ? { ...v, vote: "NEUTRAL" } : v))
        );
      } finally {
        setSaving(null);
      }
    },
    [id, tournamentPlayerId]
  );

  if (!tpId) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="text-center max-w-sm w-full">
          <p className="text-danger mb-4">{error}</p>
          <Link href={`/tournament/${id}`}>
            <Button variant="secondary">Zurück</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Zusammenfassung der Votes
  const summary = {
    desired: votes.filter((v) => v.vote === "DESIRED").length,
    neutral: votes.filter((v) => v.vote === "NEUTRAL").length,
    avoid: votes.filter((v) => v.vote === "AVOID").length,
  };

  return (
    <div className="min-h-screen">
      <ImpersonationBanner tournamentId={id} />
      <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/tournament/${id}`}>
          <Button variant="ghost" size="sm">← Zurück</Button>
        </Link>
        <h1 className="text-xl font-bold">Cube-Abstimmung</h1>
      </div>

      {/* Zusammenfassung */}
      <Card className="mb-6">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-bold text-success">{summary.desired}</p>
            <p className="text-xs text-muted">Gewünscht</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-muted">{summary.neutral}</p>
            <p className="text-xs text-muted">Neutral</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-danger">{summary.avoid}</p>
            <p className="text-xs text-muted">Vermeiden</p>
          </div>
        </div>
      </Card>

      {/* Cube-Liste */}
      <div className="flex flex-col gap-4">
        {votes.map((v) => (
          <Card key={v.cubeId}>
            {/* Cube-Bild */}
            {v.cube.imageUrl && (
              <div className="relative w-full aspect-[2/1] rounded-lg overflow-hidden mb-3 bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.cube.imageUrl}
                  alt={v.cube.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <h3 className="font-semibold mb-1">{v.cube.name}</h3>
            {v.cube.description && (
              <p className="text-sm text-muted mb-3 line-clamp-2">{v.cube.description}</p>
            )}

            {/* Vote-Buttons */}
            <div className="grid grid-cols-3 gap-2">
              {voteOptions.map((opt) => {
                const isActive = v.vote === opt.value;
                const isSaving = saving === v.cubeId;

                return (
                  <button
                    key={opt.value}
                    onClick={() => handleVote(v.cubeId, opt.value)}
                    disabled={isSaving}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 transition-all cursor-pointer
                      ${isActive
                        ? opt.activeClass
                        : "border-border bg-background hover:bg-card-hover text-muted hover:text-foreground"
                      }
                      disabled:opacity-50`}
                  >
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="text-xs font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {votes.length === 0 && (
        <Card className="text-center">
          <p className="text-muted">Keine Cubes zum Abstimmen vorhanden.</p>
        </Card>
      )}
      </div>
    </div>
  );
}
