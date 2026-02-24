import { describe, it, expect } from "vitest";
import { calculatePodSizes, runBrunswickian } from "../brunswikian";
import { PlayerInput, CubeInput, Vote } from "../types";

describe("calculatePodSizes", () => {
  it("sollte 8 Pods à 8 Spieler für 64 Spieler berechnen", () => {
    const sizes = calculatePodSizes(64);
    expect(sizes).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(64);
  });

  it("sollte korrekte Modifikation für 65 Spieler berechnen (Mod 1: +1, 0)", () => {
    const sizes = calculatePodSizes(65);
    expect(sizes[0]).toBe(9);
    expect(sizes[1]).toBe(8);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(65);
  });

  it("sollte korrekte Modifikation für 62 Spieler berechnen (Mod 6: -2, 0)", () => {
    const sizes = calculatePodSizes(62);
    expect(sizes[0]).toBe(6);
    expect(sizes[1]).toBe(8);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(62);
  });

  it("sollte korrekte Modifikation für 60 Spieler berechnen (Mod 4: -2, -2)", () => {
    const sizes = calculatePodSizes(60);
    expect(sizes[0]).toBe(6);
    expect(sizes[1]).toBe(6);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(60);
  });

  it("sollte für 16 Spieler 2 Pods à 8 ergeben", () => {
    const sizes = calculatePodSizes(16);
    expect(sizes).toEqual([8, 8]);
  });

  it("sollte für 8 Spieler einen Pod à 8 ergeben", () => {
    const sizes = calculatePodSizes(8);
    expect(sizes).toEqual([8]);
  });

  it("sollte für 3 Spieler einen einzigen Pod ergeben", () => {
    const sizes = calculatePodSizes(3);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

function makePlayer(
  id: string,
  matchPoints: number,
  votes: Record<string, Vote>
): PlayerInput {
  return { id, matchPoints, gameWins: 0, gameLosses: 0, dropped: false, votes };
}

function makeCube(id: string): CubeInput {
  return { id, name: `Cube ${id}` };
}

describe("runBrunswickian", () => {
  it("sollte alle Spieler in Pods aufteilen", () => {
    const cubes = [makeCube("c1"), makeCube("c2")];
    const players: PlayerInput[] = [];
    for (let i = 0; i < 16; i++) {
      players.push(
        makePlayer(`p${i}`, 0, { c1: "DESIRED", c2: "NEUTRAL" })
      );
    }

    const result = runBrunswickian(players, cubes);
    const allPlayerIds = result.pods.flatMap((p) => p.playerIds);
    expect(allPlayerIds.length).toBe(16);
    expect(new Set(allPlayerIds).size).toBe(16);
    expect(result.pods.length).toBe(2);
  });

  it("sollte DESIRED-Cubes bevorzugen", () => {
    const cubes = [makeCube("liked"), makeCube("disliked")];
    const players: PlayerInput[] = [];
    for (let i = 0; i < 8; i++) {
      players.push(
        makePlayer(`p${i}`, 0, { liked: "DESIRED", disliked: "AVOID" })
      );
    }

    const result = runBrunswickian(players, cubes);
    expect(result.pods[0].cubeId).toBe("liked");
  });

  it("sollte bei 0 Fix-Spielern nur Cubes mit genug Upvotes bevorzugen", () => {
    const cubes = [makeCube("popular"), makeCube("low")];
    const players: PlayerInput[] = Array.from({ length: 16 }, (_, i) => {
      const votes: Record<string, Vote> = {
        popular: i < 12 ? "DESIRED" : "NEUTRAL",
        low: i < 6 ? "DESIRED" : "NEUTRAL",
      };
      return makePlayer(`p${i}`, 0, votes);
    });

    const result = runBrunswickian(players, cubes);
    expect(result.pods[0].cubeId).toBe("popular");
  });

  it("sollte bei 0 Fix-Spielern auf bestehende Auswahl zurückfallen wenn kein Cube genug Upvotes hat", () => {
    const cubes = [makeCube("c6"), makeCube("c5")];
    const players: PlayerInput[] = Array.from({ length: 8 }, (_, i) => {
      const votes: Record<string, Vote> = {
        c6: i < 6 ? "DESIRED" : "NEUTRAL",
        c5: i < 5 ? "DESIRED" : "NEUTRAL",
      };
      return makePlayer(`p${i}`, 0, votes);
    });

    const result = runBrunswickian(players, cubes);
    expect(result.pods[0].cubeId).toBe("c6");
    expect(result.warnings.some((w) => w.includes("Fallback"))).toBe(false);
  });

  it("sollte AVOID-Cubes für Fix-Spieler vermeiden", () => {
    const cubes = [makeCube("c1"), makeCube("c2")];
    // Spieler 0-3 haben 0 Punkte (Fix im untersten Pod), Spieler 4-7 haben 3 Punkte
    const players: PlayerInput[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        makePlayer(`low${i}`, 0, { c1: "AVOID", c2: "DESIRED" })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makePlayer(`high${i}`, 3, { c1: "DESIRED", c2: "NEUTRAL" })
      ),
    ];

    const result = runBrunswickian(players, cubes);
    // Unterster Pod sollte c2 bekommen (nicht c1, das die Fix-Spieler AVOIDen)
    const bottomPod = result.pods.find((p) => p.podNumber === 1)!;
    expect(bottomPod.cubeId).toBe("c2");
  });

  it("sollte Fallback verwenden wenn Fix-Spieler alle Cubes AVOIDen", () => {
    const cubes = [makeCube("c1"), makeCube("c2")];
    // Spieler mit 0 Punkten (Fix im Pod) und Spieler mit 3 Punkten (Flex)
    // Alle Fix-Spieler AVOIDen alle Cubes
    const players: PlayerInput[] = [
      ...Array.from({ length: 4 }, (_, i) =>
        makePlayer(`fix${i}`, 0, { c1: "AVOID", c2: "AVOID" })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        makePlayer(`flex${i}`, 3, { c1: "DESIRED", c2: "DESIRED" })
      ),
    ];

    const result = runBrunswickian(players, cubes);
    expect(result.pods.length).toBe(1);
    expect(result.warnings.some((w) => w.includes("Fallback"))).toBe(true);
  });

  it("sollte ohne Fallback arbeiten wenn alle Spieler gleiche Punkte haben", () => {
    const cubes = [makeCube("c1")];
    const players: PlayerInput[] = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`p${i}`, 0, { c1: "AVOID" })
    );

    // Alle Spieler gleiche Punkte → keine Fix-Spieler → kein Fallback nötig
    const result = runBrunswickian(players, cubes);
    expect(result.pods[0].cubeId).toBe("c1");
    expect(result.warnings.some((w) => w.includes("Fallback"))).toBe(false);
  });

  it("sollte bereits verwendete Cubes ausschließen", () => {
    const cubes = [makeCube("c1"), makeCube("c2")];
    const players: PlayerInput[] = Array.from({ length: 8 }, (_, i) =>
      makePlayer(`p${i}`, 0, { c1: "DESIRED", c2: "NEUTRAL" })
    );

    const result = runBrunswickian(players, cubes, ["c1"]);
    expect(result.pods[0].cubeId).toBe("c2");
  });

  it("sollte gedropte Spieler ignorieren", () => {
    const cubes = [makeCube("c1")];
    const players: PlayerInput[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        makePlayer(`active${i}`, 0, { c1: "DESIRED" })
      ),
      { id: "dropped1", matchPoints: 0, gameWins: 0, gameLosses: 0, dropped: true, votes: { c1: "DESIRED" } },
    ];

    const result = runBrunswickian(players, cubes);
    const allIds = result.pods.flatMap((p) => p.playerIds);
    expect(allIds).not.toContain("dropped1");
    expect(allIds.length).toBe(8);
  });

  it("sollte mit 64 Spielern und 24 Cubes funktionieren", () => {
    const cubes = Array.from({ length: 24 }, (_, i) => makeCube(`c${i}`));
    const voteOptions: Vote[] = ["DESIRED", "NEUTRAL", "AVOID"];
    const players: PlayerInput[] = Array.from({ length: 64 }, (_, i) => {
      const votes: Record<string, Vote> = {};
      for (const c of cubes) {
        votes[c.id] = voteOptions[i % 3];
      }
      return makePlayer(`p${i}`, Math.floor(i / 8) * 3, votes);
    });

    const result = runBrunswickian(players, cubes);
    const allIds = result.pods.flatMap((p) => p.playerIds);
    expect(allIds.length).toBe(64);
    expect(new Set(allIds).size).toBe(64);
    expect(result.pods.length).toBe(8);
  });
});
