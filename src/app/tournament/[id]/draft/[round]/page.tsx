"use client";

import { useEffect, useState, useRef, useCallback } from "react";
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
  player: PlayerInfo;
}

interface PodPlayer {
  tournamentPlayerId: string;
  tournamentPlayer: TournamentPlayer;
}

interface Match {
  id: string;
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
  cube: { id: string; name: string };
  players: PodPlayer[];
  matches: Match[];
}

interface Draft {
  id: string;
  roundNumber: number;
  status: string;
  pods: Pod[];
}

type PhotoType = "POOL" | "DECK" | "RETURNED";

interface PhotoEntry {
  type: PhotoType;
  imageUrl: string | null;
  uploading: boolean;
}

const photoSlots: { type: PhotoType; label: string; emoji: string }[] = [
  { type: "POOL", label: "Pool", emoji: "📦" },
  { type: "DECK", label: "Deck", emoji: "🃏" },
  { type: "RETURNED", label: "Rückgabe", emoji: "↩️" },
];

// Einzelne Draft-Runde: Pod-Ansicht, Matches und Foto-Upload
export default function DraftRoundPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const round = params.round as string;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [standingsMap, setStandingsMap] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<PhotoEntry[]>(
    photoSlots.map((s) => ({ type: s.type, imageUrl: null, uploading: false }))
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tpId, setTpId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<PhotoType, HTMLInputElement | null>>({
    POOL: null,
    DECK: null,
    RETURNED: null,
  });

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
        const [draftsRes, standingsRes] = await Promise.all([
          fetch(`/api/tournaments/${id}/drafts`),
          fetch(`/api/tournaments/${id}/standings`),
        ]);
        if (!draftsRes.ok) throw new Error();
        const drafts: Draft[] = await draftsRes.json();
        const found = drafts.find((d) => d.roundNumber === parseInt(round));
        if (!found) {
          setError("Runde nicht gefunden.");
        } else {
          setDraft(found);
        }
        if (standingsRes.ok) {
          const standings: { tournamentPlayerId: string; matchPoints: number }[] = await standingsRes.json();
          const map: Record<string, number> = {};
          for (const s of standings) map[s.tournamentPlayerId] = s.matchPoints;
          setStandingsMap(map);
        }
      } catch {
        setError("Draft konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, round, tpId, hasCheckedStorage, router]);

  // Foto hochladen
  const handleUpload = useCallback(
    async (type: PhotoType, file: File) => {
      if (!tpId || !draft) return;

      setPhotos((prev) =>
        prev.map((p) => (p.type === type ? { ...p, uploading: true } : p))
      );

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("tournamentPlayerId", tpId);
        formData.append("draftId", draft.id);
        formData.append("type", type);

        const res = await fetch(`/api/tournaments/${id}/photos`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) throw new Error();
        const data = await res.json();

        setPhotos((prev) =>
          prev.map((p) =>
            p.type === type ? { ...p, imageUrl: data.imageUrl, uploading: false } : p
          )
        );
      } catch {
        setPhotos((prev) =>
          prev.map((p) => (p.type === type ? { ...p, uploading: false } : p))
        );
      }
    },
    [id, tpId, draft]
  );

  if (!tpId) return null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="text-center max-w-sm w-full">
          <p className="text-danger mb-4">{error || "Draft nicht gefunden."}</p>
          <Link href={`/tournament/${id}`}>
            <Button variant="secondary">Zurück</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Pod des aktuellen Spielers finden
  const myPod = draft.pods.find((pod) =>
    pod.players.some((pp) => pp.tournamentPlayerId === tpId)
  );

  // Spielernamen- und Punkte-Map für Match-Anzeige
  const playerMap = new Map<string, string>();
  for (const pod of draft.pods) {
    for (const pp of pod.players) {
      const pts = standingsMap[pp.tournamentPlayerId] ?? 0;
      playerMap.set(pp.tournamentPlayerId, `${pp.tournamentPlayer.player.name} (${pts} Pkt)`);
    }
  }

  return (
    <div className="min-h-screen">
      <ImpersonationBanner tournamentId={id} />
      <div className="px-4 py-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/tournament/${id}`}>
          <Button variant="ghost" size="sm">← Zurück</Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">Runde {draft.roundNumber}</h1>
          <Badge
            variant={draft.status === "ACTIVE" ? "warning" : draft.status === "FINISHED" ? "success" : "default"}
          >
            {draft.status === "ACTIVE" ? "Aktiv" : draft.status === "FINISHED" ? "Beendet" : "Geplant"}
          </Badge>
        </div>
      </div>

      {/* Pod-Info des Spielers */}
      {myPod ? (
        <>
          <Card className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Pod {myPod.podNumber}</h2>
              <Badge variant="accent">{myPod.cube.name}</Badge>
            </div>

            <div className="flex flex-col gap-1">
              {myPod.players.map((pp) => (
                <div
                  key={pp.tournamentPlayerId}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    pp.tournamentPlayerId === tpId
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-foreground"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-current shrink-0" />
                  {pp.tournamentPlayer.player.name}
                  <span className="text-muted">({standingsMap[pp.tournamentPlayerId] ?? 0} Pkt)</span>
                  {pp.tournamentPlayerId === tpId && (
                    <span className="text-xs text-muted ml-auto">(Du)</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Matches in diesem Pod */}
          {myPod.matches.length > 0 && (
            <Card className="mb-4">
              <h2 className="font-semibold mb-3">Paarungen</h2>
              <div className="flex flex-col gap-2">
                {myPod.matches.map((match) => {
                  const p1Name = playerMap.get(match.player1Id) ?? "?";
                  const p2Name = match.isBye ? "Bye" : (playerMap.get(match.player2Id ?? "") ?? "?");
                  const isMyMatch = match.player1Id === tpId || match.player2Id === tpId;

                  return (
                    <div
                      key={match.id}
                      className={`rounded-lg border p-3 ${
                        isMyMatch ? "border-accent/40 bg-accent/5" : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-muted mb-1.5">
                        <span>Swiss Runde {match.swissRound}</span>
                        {match.reported ? (
                          <Badge variant="success">Gemeldet</Badge>
                        ) : (
                          <Badge variant="default">Offen</Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${match.player1Id === tpId ? "text-accent" : ""}`}>
                          {p1Name}
                        </span>
                        <span className="text-sm font-mono text-muted px-3">
                          {match.reported ? `${match.player1Wins} – ${match.player2Wins}` : "vs"}
                        </span>
                        <span className={`text-sm font-medium ${match.player2Id === tpId ? "text-accent" : ""}`}>
                          {p2Name}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Foto-Upload */}
          <Card>
            <h2 className="font-semibold mb-3">Fotos</h2>
            <div className="grid grid-cols-3 gap-3">
              {photoSlots.map((slot) => {
                const photo = photos.find((p) => p.type === slot.type);
                const hasImage = !!photo?.imageUrl;

                return (
                  <div key={slot.type} className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => fileInputRefs.current[slot.type]?.click()}
                      disabled={photo?.uploading}
                      className="w-full aspect-square rounded-lg border-2 border-dashed border-border
                        hover:border-accent/50 bg-background flex items-center justify-center
                        transition-colors overflow-hidden cursor-pointer disabled:opacity-50"
                    >
                      {photo?.uploading ? (
                        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
                      ) : hasImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={photo!.imageUrl!}
                          alt={slot.label}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">{slot.emoji}</span>
                      )}
                    </button>
                    <span className="text-xs text-muted">{slot.label}</span>
                    <input
                      ref={(el) => { fileInputRefs.current[slot.type] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.size > 25 * 1024 * 1024) {
                            alert("Datei ist zu groß. Maximal 25 MB.");
                            return;
                          }
                          handleUpload(slot.type, file);
                        }
                        e.target.value = "";
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      ) : (
        <Card className="text-center">
          <p className="text-muted">Du bist in keinem Pod dieser Runde zugewiesen.</p>

          {/* Alle Pods anzeigen */}
          {draft.pods.length > 0 && (
            <div className="mt-4 flex flex-col gap-3 text-left">
              {draft.pods.map((pod) => (
                <div key={pod.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">Pod {pod.podNumber}</span>
                    <Badge variant="accent">{pod.cube.name}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {pod.players.map((pp) => (
                      <Badge key={pp.tournamentPlayerId} variant="default">
                        {pp.tournamentPlayer.player.name} ({standingsMap[pp.tournamentPlayerId] ?? 0} Pkt)
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      </div>
    </div>
  );
}
