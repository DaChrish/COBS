import { describe, it, expect } from "vitest";
import { runSimulation } from "../simulation";

// Simulationstests rufen den echten Optimizer-Service auf (OPTIMIZER_URL, Standard: localhost:8000).
// Python-Service muss laufen, sonst schlagen die Tests fehl.

describe("Simulation", () => {
  it("sollte eine vollständige Simulation mit 64 Spielern durchlaufen", async () => {
    const stats = await runSimulation({
      playerCount: 64,
      cubeCount: 24,
      draftRounds: 3,
      swissRoundsPerDraft: 3,
      desiredRate: 0.3,
      avoidRate: 0.2,
      seed: 42,
    });

    expect(stats.totalPods).toBe(24); // 8 Pods × 3 Drafts
    const totalAssignments =
      stats.desiredAssignments + stats.neutralAssignments + stats.avoidAssignments;
    expect(totalAssignments).toBe(192); // 64 Spieler × 3 Drafts
  });

  it("sollte DESIRED-Rate höher als AVOID-Rate halten", async () => {
    const stats = await runSimulation({
      playerCount: 64,
      cubeCount: 24,
      draftRounds: 3,
      swissRoundsPerDraft: 3,
      desiredRate: 0.3,
      avoidRate: 0.2,
      seed: 42,
    });

    expect(stats.desiredRate).toBeGreaterThan(stats.avoidRate);
  });

  it("sollte mit kleinen Turnieren funktionieren", async () => {
    const stats = await runSimulation({
      playerCount: 10,
      cubeCount: 6,
      draftRounds: 3,
      swissRoundsPerDraft: 3,
      desiredRate: 0.4,
      avoidRate: 0.15,
      seed: 123,
    });

    expect(stats.totalPods).toBeGreaterThan(0);
  });

  it("sollte mit großen Turnieren funktionieren", async () => {
    const stats = await runSimulation({
      playerCount: 128,
      cubeCount: 48,
      draftRounds: 3,
      swissRoundsPerDraft: 3,
      desiredRate: 0.25,
      avoidRate: 0.25,
      seed: 999,
    });

    expect(stats.totalPods).toBeGreaterThan(0);
    const totalAssignments =
      stats.desiredAssignments + stats.neutralAssignments + stats.avoidAssignments;
    expect(totalAssignments).toBe(128 * 3);
  });

  it("sollte deterministische Ergebnisse bei gleichem Seed liefern", async () => {
    const config = {
      playerCount: 32,
      cubeCount: 12,
      draftRounds: 3,
      swissRoundsPerDraft: 3,
      desiredRate: 0.3,
      avoidRate: 0.2,
      seed: 42,
    };

    const stats1 = await runSimulation(config);
    const stats2 = await runSimulation(config);

    expect(stats1.desiredAssignments).toBe(stats2.desiredAssignments);
    expect(stats1.avoidAssignments).toBe(stats2.avoidAssignments);
    expect(stats1.totalPods).toBe(stats2.totalPods);
  });
});
