"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import ImpersonationBanner from "@/components/ImpersonationBanner";

interface Standing {
  rank: number;
  tournamentPlayerId: string;
  playerId: string;
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

// Standings-Tabelle mit Tiebreakern, aktuelle Platzierung hervorgehoben
export default function StandingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [standings, setStandings] = useState<Standing[]>([]);
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
        const res = await fetch(`/api/tournaments/${id}/standings`);
        if (!res.ok) throw new Error();
        setStandings(await res.json());
      } catch {
        setError("Standings konnten nicht geladen werden.");
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

  const myRank = standings.find((s) => s.tournamentPlayerId === tpId);

  return (
    <div className="min-h-screen">
      <ImpersonationBanner tournamentId={id} />
      <div className="px-4 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/tournament/${id}`}>
          <Button variant="ghost" size="sm">← Zurück</Button>
        </Link>
        <h1 className="text-xl font-bold">Standings</h1>
      </div>

      {/* Eigene Platzierung hervorgehoben */}
      {myRank && (
        <Card className="mb-6 border-accent/40 bg-accent/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted">Deine Platzierung</p>
              <p className="text-3xl font-bold">#{myRank.rank}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{myRank.matchPoints} Pkt.</p>
              <p className="text-sm text-muted">
                {myRank.matchWins}W – {myRank.matchLosses}L – {myRank.matchDraws}D
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tabelle — horizontal scrollbar auf kleinen Bildschirmen */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="px-3 py-3 font-medium">#</th>
                <th className="px-3 py-3 font-medium">Spieler</th>
                <th className="px-3 py-3 font-medium text-right">Pkt.</th>
                <th className="px-3 py-3 font-medium text-right">W-L-D</th>
                <th className="px-3 py-3 font-medium text-right whitespace-nowrap">OMW%</th>
                <th className="px-3 py-3 font-medium text-right whitespace-nowrap">GW%</th>
                <th className="px-3 py-3 font-medium text-right whitespace-nowrap">OGW%</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => {
                const isMe = s.tournamentPlayerId === tpId;

                return (
                  <tr
                    key={s.tournamentPlayerId}
                    className={`border-b border-border/50 last:border-0 transition-colors ${
                      isMe ? "bg-accent/8" : "hover:bg-card-hover"
                    }`}
                  >
                    <td className="px-3 py-3 font-medium tabular-nums">
                      {s.rank}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={isMe ? "text-accent font-semibold" : ""}>
                          {s.playerName}
                        </span>
                        {isMe && <Badge variant="accent">Du</Badge>}
                        {s.dropped && <Badge variant="danger">Drop</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-bold tabular-nums">
                      {s.matchPoints}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted whitespace-nowrap">
                      {s.matchWins}-{s.matchLosses}-{s.matchDraws}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">
                      {s.omwPercent.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">
                      {s.gwPercent.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted">
                      {s.ogwPercent.toFixed(2)}
                    </td>
                  </tr>
                );
              })}

              {standings.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted">
                    Noch keine Standings verfügbar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      </div>
    </div>
  );
}
