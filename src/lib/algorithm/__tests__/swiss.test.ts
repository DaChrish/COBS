import { describe, it, expect } from "vitest";
import {
  generateSwissPairings,
  calculatePointsFromResults,
  calculateTiebreakers,
} from "../swiss";

describe("generateSwissPairings", () => {
  it("sollte korrekte Paarungen für 8 Spieler generieren", () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      matchPoints: 0,
    }));

    const result = generateSwissPairings(players, [], []);
    expect(result.pairings.length).toBe(4);
    expect(result.pairings.every((p) => !p.isBye)).toBe(true);
  });

  it("sollte ein Bye bei ungerader Spieleranzahl vergeben", () => {
    const players = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      matchPoints: 0,
    }));

    const result = generateSwissPairings(players, [], []);
    const byePairings = result.pairings.filter((p) => p.isBye);
    expect(byePairings.length).toBe(1);
    expect(result.pairings.length).toBe(4); // 3 Matches + 1 Bye
  });

  it("sollte Bye nicht an denselben Spieler doppelt vergeben", () => {
    const players = Array.from({ length: 7 }, (_, i) => ({
      id: `p${i}`,
      matchPoints: i === 6 ? 0 : 3,
    }));

    // Runde 1: p6 hat Bye bekommen
    const result = generateSwissPairings(players, [], ["p6"]);
    const byePairing = result.pairings.find((p) => p.isBye)!;
    expect(byePairing.player1Id).not.toBe("p6");
  });

  it("sollte Wiederholungspaarungen vermeiden", () => {
    const players = [
      { id: "p0", matchPoints: 3 },
      { id: "p1", matchPoints: 3 },
      { id: "p2", matchPoints: 0 },
      { id: "p3", matchPoints: 0 },
    ];

    const prev = [{ player1Id: "p0", player2Id: "p1" }];
    const result = generateSwissPairings(players, prev, []);

    const p0match = result.pairings.find(
      (p) => p.player1Id === "p0" || p.player2Id === "p0"
    )!;
    expect(p0match.player2Id).not.toBe("p1");
  });

  it("sollte alle Spieler paaren", () => {
    const players = Array.from({ length: 6 }, (_, i) => ({
      id: `p${i}`,
      matchPoints: i * 3,
    }));

    const result = generateSwissPairings(players, [], []);
    const allIds = result.pairings.flatMap((p) =>
      [p.player1Id, p.player2Id].filter(Boolean)
    );
    expect(new Set(allIds).size).toBe(6);
  });
});

describe("calculatePointsFromResults", () => {
  it("sollte Punkte korrekt berechnen", () => {
    const results = [
      { player1Id: "p0", player2Id: "p1", player1Wins: 2, player2Wins: 1, isBye: false },
      { player1Id: "p2", player2Id: "p3", player1Wins: 0, player2Wins: 2, isBye: false },
    ];

    const points = calculatePointsFromResults(results);
    expect(points.get("p0")!.matchPoints).toBe(3);
    expect(points.get("p1")!.matchPoints).toBe(0);
    expect(points.get("p2")!.matchPoints).toBe(0);
    expect(points.get("p3")!.matchPoints).toBe(3);
  });

  it("sollte Bye korrekt behandeln", () => {
    const results = [
      { player1Id: "p0", player2Id: null, player1Wins: 2, player2Wins: 0, isBye: true },
    ];

    const points = calculatePointsFromResults(results);
    expect(points.get("p0")!.matchPoints).toBe(3);
    expect(points.get("p0")!.gameWins).toBe(2);
  });

  it("sollte Unentschieden korrekt bewerten", () => {
    const results = [
      { player1Id: "p0", player2Id: "p1", player1Wins: 1, player2Wins: 1, isBye: false },
    ];

    const points = calculatePointsFromResults(results);
    expect(points.get("p0")!.matchPoints).toBe(1);
    expect(points.get("p1")!.matchPoints).toBe(1);
  });
});

describe("calculateTiebreakers", () => {
  it("sollte Tiebreaker-Werte berechnen", () => {
    const results = [
      { player1Id: "p0", player2Id: "p1", player1Wins: 2, player2Wins: 0, isBye: false },
      { player1Id: "p0", player2Id: "p2", player1Wins: 2, player2Wins: 1, isBye: false },
    ];

    const tb = calculateTiebreakers(["p0", "p1", "p2"], results);
    expect(tb.get("p0")!.gw).toBeGreaterThan(0.33);
    expect(tb.get("p0")!.omw).toBeDefined();
    expect(tb.get("p0")!.ogw).toBeDefined();
  });
});
