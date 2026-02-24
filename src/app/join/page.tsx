"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

export default function JoinPage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Bereits eingeloggter Spieler?
  const [loggedInName, setLoggedInName] = useState<string | null>(null);
  const [loggedInId, setLoggedInId] = useState<string | null>(null);

  useEffect(() => {
    const pid = localStorage.getItem("player_id");
    const pname = localStorage.getItem("player_name");
    if (pid && pname) {
      setLoggedInId(pid);
      setLoggedInName(pname);
      setName(pname);
    }
  }, []);

  const isLoggedIn = !!loggedInId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedCode = joinCode.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedCode) {
      setError("Bitte den Turnier-Code eingeben.");
      return;
    }
    if (!isLoggedIn && (!trimmedName || !password)) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }

    setLoading(true);

    try {
      // Turnier anhand des Join-Codes finden
      const tournamentsRes = await fetch("/api/tournaments");
      if (!tournamentsRes.ok) throw new Error();

      const tournaments = await tournamentsRes.json();
      const tournament = tournaments.find(
        (t: { joinCode: string }) => t.joinCode === trimmedCode
      );

      if (!tournament) {
        setError("Kein Turnier mit diesem Code gefunden.");
        setLoading(false);
        return;
      }

      // Spieler dem Turnier beitreten lassen
      const joinBody = isLoggedIn
        ? { playerId: loggedInId, joinCode: trimmedCode }
        : { name: trimmedName, password, joinCode: trimmedCode };

      const joinRes = await fetch(`/api/tournaments/${tournament.id}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(joinBody),
      });

      const data = await joinRes.json();

      if (!joinRes.ok) {
        if (joinRes.status === 409 && data.tournamentPlayer) {
          // Bereits beigetreten → Session setzen und weiterleiten
          localStorage.setItem(`tp_${tournament.id}`, data.tournamentPlayer.id);
          localStorage.setItem(`player_${tournament.id}`, data.tournamentPlayer.playerId || loggedInId || "");
          router.push(`/tournament/${tournament.id}`);
          return;
        }
        setError(data.error || "Beitritt fehlgeschlagen.");
        setLoading(false);
        return;
      }

      // Session speichern
      const pid = data.player.id;
      localStorage.setItem(`tp_${tournament.id}`, data.tournamentPlayer.id);
      localStorage.setItem(`player_${tournament.id}`, pid);
      localStorage.setItem("player_id", pid);
      localStorage.setItem("player_name", data.player.name);

      router.push(`/tournament/${tournament.id}`);
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Turnier beitreten</h1>
          <p className="text-muted mt-2 text-sm">
            {isLoggedIn
              ? `Angemeldet als ${loggedInName}. Gib den Turnier-Code ein.`
              : "Gib den Turnier-Code ein, um mitzuspielen."}
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="joinCode"
              label="Turnier-Code"
              placeholder="z.B. A1B2C3D4"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
            />

            {!isLoggedIn && (
              <>
                <Input
                  id="name"
                  label="Spielername"
                  placeholder="Dein Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="username"
                />
                <Input
                  id="password"
                  label="Passwort"
                  type="password"
                  placeholder="Dein Passwort"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </>
            )}

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              Beitreten
            </Button>
          </form>
        </Card>

        <div className="text-center text-sm text-muted mt-6 space-y-2">
          {isLoggedIn ? (
            <Link href="/dashboard" className="text-accent hover:text-accent-hover transition-colors">
              ← Zurück zum Dashboard
            </Link>
          ) : (
            <>
              <p>
                Bereits registriert?{" "}
                <Link href="/login" className="text-accent hover:text-accent-hover transition-colors">
                  Anmelden
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
