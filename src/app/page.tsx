import Link from "next/link";
import Button from "@/components/ui/Button";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Dekorative Hintergrund-Elemente */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/3 rounded-full blur-3xl" />
      </div>

      <div className="text-center space-y-8 relative z-10 max-w-2xl">
        {/* Titel */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            MTG Cube Draft Manager
          </div>
          <h1 className="text-6xl font-bold tracking-tight sm:text-7xl">
            Draft <span className="text-accent">Tool</span>
          </h1>
          <p className="text-muted text-lg max-w-md mx-auto leading-relaxed">
            Organisiere Cube-Draft-Turniere mit dem Brunswikian System —
            faire Pod-Zuteilung basierend auf Spielerpräferenzen.
          </p>
        </div>

        {/* Navigationsbuttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link href="/login">
            <Button variant="primary" size="lg" className="w-full sm:w-auto min-w-[200px]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Anmelden
            </Button>
          </Link>
          <Link href="/join">
            <Button variant="secondary" size="lg" className="w-full sm:w-auto min-w-[200px]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Turnier beitreten
            </Button>
          </Link>
        </div>

        {/* Admin-Link dezent darunter */}
        <div className="pt-2">
          <Link href="/admin" className="text-sm text-muted hover:text-foreground transition-colors">
            Admin-Bereich →
          </Link>
        </div>
      </div>
    </div>
  );
}
