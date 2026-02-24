"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName || !password) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login fehlgeschlagen.");
        setLoading(false);
        return;
      }

      // Globale Spieler-Session speichern
      localStorage.setItem("player_id", data.player.id);
      localStorage.setItem("player_name", data.player.name);

      // Pro-Turnier-Sessions setzen
      for (const t of data.tournaments) {
        localStorage.setItem(`tp_${t.tournamentId}`, t.tournamentPlayerId);
        localStorage.setItem(`player_${t.tournamentId}`, data.player.id);
      }

      router.push("/dashboard");
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Anmelden</h1>
          <p className="text-muted mt-2 text-sm">
            Melde dich mit deinem Spielernamen an.
          </p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="name"
              label="Spielername"
              placeholder="Dein Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              autoFocus
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

            {error && (
              <div className="rounded-lg bg-danger/10 border border-danger/30 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
              Anmelden
            </Button>
          </form>
        </Card>

        <p className="text-center text-sm text-muted mt-6">
          Erstes Mal hier?{" "}
          <Link href="/join" className="text-accent hover:text-accent-hover transition-colors">
            Turnier beitreten
          </Link>
        </p>
      </div>
    </div>
  );
}
