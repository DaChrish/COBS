# COBS -- Cube Draft Tournament Manager

Swiss-style tournament manager for MTG Cube drafts, with vote-based pod optimization, photo tracking, and PDF exports.

> **Hinweis:** Das Projekt ist **Work in Progress** und **vibe coded** -- also iterativ entstanden, ohne Anspruch auf perfekte Architektur.

## Quick Start

```bash
docker compose up -d --build
```

Das startet:
- **Frontend** auf http://localhost:3000 (React/Vite)
- **Backend** auf http://localhost:8000 (FastAPI)
- **PostgreSQL** auf localhost:5432

Die Datenbank-Migrationen laufen automatisch beim Start.

## Admin-Account anlegen

Es gibt keinen Default-Admin. Der erste Admin wird per API erstellt:

```bash
curl -X POST http://localhost:8000/auth/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "dein-passwort"}'
```

Dieser Endpoint funktioniert nur einmal -- danach gibt er `409 Conflict` zurueck.

Danach einloggen unter http://localhost:3000/login.

## Test-Turniere

Als Admin kann man Test-Turniere mit automatisch generierten Spielern und Votes erstellen:

```bash
curl -X POST http://localhost:8000/test/tournament \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Mein Test", "num_players": 13, "num_cubes": 4, "seed": 42}'
```

Test-Turniere haben im Admin-Panel Simulations-Buttons fuer:
- Match-Ergebnisse (mit/ohne Konflikte)
- Foto-Uploads (komplett/lueckenhaft)

**Test-Spieler Passwort:** `test`

## Turnier-Ablauf

1. **Admin erstellt Turnier** mit Cubes
2. **Spieler treten bei** via Join-Code (Account wird automatisch erstellt)
3. **Voting** -- Spieler bewerten Cubes (Desired / Neutral / Avoid)
4. **Admin generiert Draft** -- Optimizer verteilt Spieler auf Pods basierend auf Votes
5. **Spieler laden Fotos hoch** (Pool, Deck) -- Pflicht vor Pairings
6. **Admin generiert Pairings** -- Swiss-System pro Pod
7. **Spieler melden Ergebnisse** -- Konflikte werden vom Admin geloest
8. **Wiederholung** fuer mehrere Swiss-Runden und Draft-Runden
9. **Spieler laden Returned-Fotos hoch** vor naechstem Draft
10. **Standings** mit MTG-Tiebreakers (OMW%, GW%, OGW%)

## Entwicklung

### Backend

```bash
cd backend
uv pip install --system ".[dev]"
uv run pytest tests/ -v
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Umgebungsvariablen

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `COBS_DATABASE_URL` | `postgresql+asyncpg://drafttool:drafttool@localhost:5432/drafttool` | Datenbank-Verbindung |
| `COBS_JWT_SECRET` | `change-me-in-production` | JWT Signing Secret |
| `COBS_JWT_EXPIRE_MINUTES` | `10080` (7 Tage) | Token-Ablaufzeit |

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL, Alembic, OR-Tools (Pod-Optimizer), Pillow, fpdf2
- **Frontend:** React, Vite, Mantine UI, React Router
- **Infrastruktur:** Docker Compose
