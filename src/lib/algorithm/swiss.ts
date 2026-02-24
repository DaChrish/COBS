import { SwissPairing, SwissRoundResult, MatchResult } from "./types";

interface SwissPlayer {
  id: string;
  matchPoints: number;
}

/**
 * Erzeugt Swiss-Paarungen für eine Runde innerhalb eines Pods.
 *
 * - Spieler werden nach Punkten sortiert (höchste zuerst).
 * - Spieler mit gleichen Punkten werden gegeneinander gepaart.
 * - Bereits gespielte Paarungen werden vermieden wenn möglich.
 * - Bei ungerader Spieleranzahl: Bye für den niedrigsten Spieler ohne bisheriges Bye.
 */
export function generateSwissPairings(
  players: SwissPlayer[],
  previousMatches: Array<{ player1Id: string; player2Id: string | null }>,
  previousByes: string[]
): SwissRoundResult {
  const warnings: string[] = [];
  const pairings: SwissPairing[] = [];

  if (players.length === 0) {
    return { pairings: [], warnings: ["Keine Spieler für Paarungen."] };
  }

  // Set mit bereits gespielten Paarungen (normalisiert als "id1-id2" mit id1 < id2)
  const playedPairs = new Set<string>();
  for (const m of previousMatches) {
    if (m.player2Id) {
      const key = [m.player1Id, m.player2Id].sort().join("-");
      playedPairs.add(key);
    }
  }

  const sorted = [...players].sort((a, b) => b.matchPoints - a.matchPoints);

  // Bye-Handling bei ungerader Anzahl
  let byePlayer: SwissPlayer | null = null;
  let playersToMatch = sorted;

  if (sorted.length % 2 !== 0) {
    // Suche den niedrigsten Spieler ohne bisheriges Bye
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!previousByes.includes(sorted[i].id)) {
        byePlayer = sorted[i];
        playersToMatch = sorted.filter((_, idx) => idx !== i);
        break;
      }
    }

    // Falls alle schon ein Bye hatten: niedrigster Spieler bekommt erneut Bye
    if (!byePlayer) {
      byePlayer = sorted[sorted.length - 1];
      playersToMatch = sorted.slice(0, -1);
      warnings.push(
        `Alle Spieler hatten bereits ein Bye. ${byePlayer.id} bekommt ein weiteres.`
      );
    }

    pairings.push({
      player1Id: byePlayer.id,
      player2Id: null,
      isBye: true,
    });
  }

  // Greedy-Paarung: Versuche optimale Paarungen ohne Wiederholung
  const paired = new Set<string>();
  const remaining = [...playersToMatch];

  for (let i = 0; i < remaining.length; i++) {
    if (paired.has(remaining[i].id)) continue;

    const p1 = remaining[i];
    let bestMatch: SwissPlayer | null = null;
    let bestMatchIdx = -1;

    // Suche den besten noch nicht gepaarten Gegner (gleiche oder nächste Punkte)
    for (let j = i + 1; j < remaining.length; j++) {
      if (paired.has(remaining[j].id)) continue;

      const pairKey = [p1.id, remaining[j].id].sort().join("-");
      if (!playedPairs.has(pairKey)) {
        bestMatch = remaining[j];
        bestMatchIdx = j;
        break;
      }
    }

    // Fallback: Wenn alle Gegner schon gespielt, den nächsten ungeparten nehmen
    if (!bestMatch) {
      for (let j = i + 1; j < remaining.length; j++) {
        if (!paired.has(remaining[j].id)) {
          bestMatch = remaining[j];
          bestMatchIdx = j;
          warnings.push(
            `Wiederholungs-Paarung: ${p1.id} vs ${remaining[j].id}`
          );
          break;
        }
      }
    }

    if (bestMatch) {
      paired.add(p1.id);
      paired.add(bestMatch.id);
      pairings.push({
        player1Id: p1.id,
        player2Id: bestMatch.id,
        isBye: false,
      });
    }
  }

  return { pairings, warnings };
}

/**
 * Berechnet Punkte aus Match-Ergebnissen.
 * Win = 3 Punkte, Draw = 1, Loss = 0, Bye = 3 (+ 2-0 Games).
 */
export function calculatePointsFromResults(
  results: MatchResult[]
): Map<string, { matchPoints: number; gameWins: number; gameLosses: number }> {
  const stats = new Map<
    string,
    { matchPoints: number; gameWins: number; gameLosses: number }
  >();

  const getOrCreate = (id: string) => {
    if (!stats.has(id)) {
      stats.set(id, { matchPoints: 0, gameWins: 0, gameLosses: 0 });
    }
    return stats.get(id)!;
  };

  for (const result of results) {
    const p1 = getOrCreate(result.player1Id);

    if (result.isBye) {
      p1.matchPoints += 3;
      p1.gameWins += 2;
      continue;
    }

    if (!result.player2Id) continue;
    const p2 = getOrCreate(result.player2Id);

    p1.gameWins += result.player1Wins;
    p1.gameLosses += result.player2Wins;
    p2.gameWins += result.player2Wins;
    p2.gameLosses += result.player1Wins;

    if (result.player1Wins > result.player2Wins) {
      p1.matchPoints += 3;
    } else if (result.player2Wins > result.player1Wins) {
      p2.matchPoints += 3;
    } else {
      p1.matchPoints += 1;
      p2.matchPoints += 1;
    }
  }

  return stats;
}

/**
 * Berechnet Tiebreaker-Werte: OMW%, GW%, OGW%.
 */
export function calculateTiebreakers(
  playerIds: string[],
  allResults: MatchResult[]
): Map<string, { omw: number; gw: number; ogw: number }> {
  const opponents = new Map<string, string[]>();
  const stats = calculatePointsFromResults(allResults);
  const tiebreakers = new Map<string, { omw: number; gw: number; ogw: number }>();

  // Gegner-Listen aufbauen
  for (const result of allResults) {
    if (result.isBye || !result.player2Id) continue;
    const op1 = opponents.get(result.player1Id) ?? [];
    op1.push(result.player2Id);
    opponents.set(result.player1Id, op1);

    const op2 = opponents.get(result.player2Id) ?? [];
    op2.push(result.player1Id);
    opponents.set(result.player2Id, op2);
  }

  // Hilfsfunktion: Match-Win% eines Spielers (min 33%)
  const matchWinPercent = (id: string, roundsPlayed: number): number => {
    const s = stats.get(id);
    if (!s || roundsPlayed === 0) return 0.33;
    return Math.max(s.matchPoints / (roundsPlayed * 3), 0.33);
  };

  // Game-Win% eines Spielers (min 33%)
  const gameWinPercent = (id: string): number => {
    const s = stats.get(id);
    if (!s) return 0.33;
    const total = s.gameWins + s.gameLosses;
    if (total === 0) return 0.33;
    return Math.max(s.gameWins / total, 0.33);
  };

  // Runden pro Spieler zählen
  const roundsPlayed = new Map<string, number>();
  for (const result of allResults) {
    roundsPlayed.set(
      result.player1Id,
      (roundsPlayed.get(result.player1Id) ?? 0) + 1
    );
    if (result.player2Id) {
      roundsPlayed.set(
        result.player2Id,
        (roundsPlayed.get(result.player2Id) ?? 0) + 1
      );
    }
  }

  for (const id of playerIds) {
    const opps = opponents.get(id) ?? [];
    const rounds = roundsPlayed.get(id) ?? 0;

    // OMW%: Durchschnitt der Match-Win% aller Gegner
    const omw =
      opps.length > 0
        ? opps.reduce(
            (sum, oppId) =>
              sum + matchWinPercent(oppId, roundsPlayed.get(oppId) ?? 0),
            0
          ) / opps.length
        : 0.33;

    const gw = gameWinPercent(id);

    // OGW%: Durchschnitt der Game-Win% aller Gegner
    const ogw =
      opps.length > 0
        ? opps.reduce((sum, oppId) => sum + gameWinPercent(oppId), 0) /
          opps.length
        : 0.33;

    tiebreakers.set(id, { omw, gw, ogw });
  }

  return tiebreakers;
}
