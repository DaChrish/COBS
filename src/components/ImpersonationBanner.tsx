"use client";

import { useState, useEffect } from "react";

interface Props {
  tournamentId: string;
}

export default function ImpersonationBanner({ tournamentId }: Props) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(localStorage.getItem(`impersonating_${tournamentId}`));
  }, [tournamentId]);

  if (!name) return null;

  const handleStop = () => {
    localStorage.removeItem(`tp_${tournamentId}`);
    localStorage.removeItem(`player_${tournamentId}`);
    localStorage.removeItem(`impersonating_${tournamentId}`);
    window.close();
  };

  return (
    <div className="bg-accent/20 border-b border-accent/40 px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <span className="text-accent font-medium">Admin-Ansicht als</span>
        <span className="font-bold text-foreground">{name}</span>
      </div>
      <button
        onClick={handleStop}
        className="text-xs text-accent hover:text-accent-hover font-medium transition-colors cursor-pointer"
      >
        Beenden
      </button>
    </div>
  );
}
