# COBS — Brunswikian System

**COBS** ist ein Tool zum Verwalten von MTG-Draft-Cube-Turnieren: Turniere anlegen, Spieler-Cube-Stimmen (DESIRED/NEUTRAL/AVOID) erfassen, Draft-Runden mit Pod- und Cube-Zuweisung per externem Optimizer (OR-Tools/MILP) generieren, Swiss-Paarungen pro Pod und Ergebnis-Meldung. Die App spricht mit einem separaten Python-Optimizer-Service und einer PostgreSQL-Datenbank.

> **Hinweis:** Das Projekt ist **Work in Progress** und **vibe coded** – also iterativ entstanden, ohne Anspruch auf perfekte Architektur. Es funktioniert, wird aber laufend erweitert und aufgeräumt.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Projekt mit Docker starten

Nach dem Klonen des Repos reicht Folgendes, um alles (App, Optimizer, PostgreSQL) per Docker zu starten:

1. **Voraussetzung:** [Docker](https://docs.docker.com/get-docker/) und [Docker Compose](https://docs.docker.com/compose/install/) installiert.

2. **Im Projektordner:**

   ```bash
   docker compose up --build
   ```

3. **Erster Start:** Beim ersten Mal werden Images gebaut und die Datenbank-Migrationen automatisch ausgeführt. Danach:
   - **App:** [http://localhost:3000](http://localhost:3000)
   - **Optimizer-API:** [http://localhost:8000](http://localhost:8000) (z. B. `/health`)
   - **PostgreSQL:** Port `5432` (User/DB/Pass: `drafttool`/`drafttool`/`drafttool`)

4. **Optional – lokale Umgebung:** Wenn du Werte überschreiben willst (z. B. Admin-Passwort), lege eine `.env`-Datei an; die Werte aus `docker-compose` (z. B. `DATABASE_URL`, `OPTIMIZER_URL`) werden im Container gesetzt und müssen nur bei Bedarf angepasst werden.

5. **Stoppen:** `Ctrl+C` oder `docker compose down`.

## Test-Turnier anlegen

Zum Durchklicken und Testen kannst du ein **Test-Turnier** mit vorgefertigten Spielern und zufälligen Cube-Stimmen anlegen:

1. App öffnen (z. B. [http://localhost:3000](http://localhost:3000)), zur **Admin**-Seite gehen.
2. **Admin-Code** eingeben und bestätigen. Default: admin123
3. Auf der Admin-Übersicht **„Test-Turnier erstellen“** klicken.
4. Im Modal **Cube-Anzahl**, **Spieleranzahl** und optional einen **Seed** (für reproduzierbare Zufalls-Votes) eintragen, dann **„Test-Turnier erstellen“** klicken.
5. Das Turnier erscheint in der Liste; du kannst Drafts generieren, Paarungen erzeugen und ggf. **„Ergebnisse zufällig (diese Runde)“** nutzen.

**Spieler-Passwort im Test-Turnier:** Alle angelegten Test-Spieler haben das Passwort **`test`** (zum Anmelden als Spieler, z. B. für Stimmen oder Join-Code).

## Getting Started (ohne Docker)

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
