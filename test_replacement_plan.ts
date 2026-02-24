// ═══════════════════════════════════════════════════════════════════════════
//  SIMPLE TOURNAMENT TEST (WITH UNPOPULAR BONUS)
// ═══════════════════════════════════════════════════════════════════════════

describe("24 players / 9 cubes — Simple 3-round tournament with varied voting behavior", () => {
  beforeEach(() => {
    // Explicitly set the Early Round Unpopular Bonus to 3 for testing
    setEarlyRoundUnpopularBonus(3);
  });

  /*
   * ┌───────────────────────────────────────────────────────────────────┐
   * │  SCENARIO DESIGN                                                 │
   * ├───────────────────────────────────────────────────────────────────┤
   * │  We have 24 players (3 pods of 8) and 9 Cubes for 3 rounds.      │
   * │                                                                  │
   * │  CUBES (3 per round):                                            │
   * │    - "Pop": Very popular. 0 global AVOIDs. Bonus = 0 × 3 = 0.    │
   * │    - "Mid": Mixed. 8 AVOIDs (Group B). Bonus = 8 × 3 = 24.       │
   * │    - "Unpop": Unpopular. 16 AVOIDs (B+C). Bonus = 16 × 3 = 48.   │
   * │                                                                  │
   * │  VOTING BEHAVIOR (No normal distribution, explicit tendencies):  │
   * │    - Group A (8 players): "Positive Voters"                      │
   * │        Votes: WANT all 9 cubes. AVOID none.                      │
   * │        -> avoidCount = 0. fairnessWeight = 1.0                   │
   * │        -> WANT score = 5.0 × 1.0 = 5.0                           │
   * │    - Group B (8 players): "Very Negative Voters"                 │
   * │        Votes: WANT Pop1-3. AVOID Mid1-3, Unpop1-3, D1-D3.        │
   * │        -> total avoids = 9. fairnessWeight = 1/10 = 0.1          │
   * │        -> WANT score = 5.0 × 0.1 = 0.5                           │
   * │    - Group C (8 players): "Moderate Negative Voters"             │
   * │        Votes: WANT Mid1-3. AVOID Unpop1-3, D1.                   │
   * │        -> total avoids = 4. fairnessWeight = 1/5 = 0.2           │
   * │        -> WANT score = 5.0 × 0.2 = 1.0                           │
   * │                                                                  │
   * │  WHY THE OPTIMAL SCORE IN R1 IS EXACTLY 124.0:                   │
   * │  The algorithm assigns pods to maximize (preference + bonus).    │
   * │  - Pod A gets "Unpop1":                                          │
   * │      Pref: 8 players × 5.0 = 40.0                                │
   * │      Bonus: 48.0                                                 │
   * │      Total = 88.0                                                │
   * │  - Pod B gets "Pop1":                                            │
   * │      Pref: 8 players × 0.5 = 4.0                                 │
   * │      Bonus: 0.0                                                  │
   * │      Total = 4.0                                                 │
   * │  - Pod C gets "Mid1":                                            │
   * │      Pref: 8 players × 1.0 = 8.0                                 │
   * │      Bonus: 24.0                                                 │
   * │      Total = 32.0                                                │
   * │  Grand Total = 88.0 + 4.0 + 32.0 = 124.0                         │
   * │                                                                  │
   * │  In Round 2 and 3, Bonus is 0, so Optimal Score is 52.0.         │
   * └───────────────────────────────────────────────────────────────────┘
   */

  function buildCubes(): CubeInput[] {
    return [
      makeCube("Pop1"), makeCube("Mid1"), makeCube("Unpop1"),
      makeCube("Pop2"), makeCube("Mid2"), makeCube("Unpop2"),
      makeCube("Pop3"), makeCube("Mid3"), makeCube("Unpop3")
    ];
  }

  function buildPlayers(): PlayerInput[] {
    const players: PlayerInput[] = [];

    // Group A: Positive Voters
    for (let i = 0; i < 8; i++) {
      const votes: Record<string, Vote> = {};
      ["Pop1", "Mid1", "Unpop1", "Pop2", "Mid2", "Unpop2", "Pop3", "Mid3", "Unpop3"].forEach(
        (c) => (votes[c] = "DESIRED")
      );
      players.push(makePlayer(`A${i}`, 0, votes));
    }

    // Group B: Very Negative Voters
    for (let i = 0; i < 8; i++) {
      const votes: Record<string, Vote> = {};
      ["Pop1", "Pop2", "Pop3"].forEach((c) => (votes[c] = "DESIRED"));
      ["Mid1", "Mid2", "Mid3", "Unpop1", "Unpop2", "Unpop3", "D1", "D2", "D3"].forEach(
        (c) => (votes[c] = "AVOID")
      );
      players.push(makePlayer(`B${i}`, 0, votes));
    }

    // Group C: Moderate Negative Voters
    for (let i = 0; i < 8; i++) {
      const votes: Record<string, Vote> = {};
      ["Mid1", "Mid2", "Mid3"].forEach((c) => (votes[c] = "DESIRED"));
      ["Unpop1", "Unpop2", "Unpop3", "D1"].forEach((c) => (votes[c] = "AVOID"));
      players.push(makePlayer(`C${i}`, 0, votes));
    }

    return players;
  }

  it("round 1: uses EARLY_ROUND_UNPOPULAR_BONUS to achieve optimal total score of 124.0", () => {
    const result = runOptimizedRound(buildPlayers(), buildCubes().slice(0, 3), {
      roundNumber: 1,
      podCount: 3,
    });
    
    expect(result.totalScore).toBeCloseTo(124.0, 4);
    expect(result.avoidCount).toBe(0); // Everyone placed in non-avoided cubes
    
    // Check correct assignments
    const unpopPod = result.pods.find(p => p.cubeId === "Unpop1");
    expect(unpopPod?.playerIds[0].startsWith("A")).toBe(true);

    const popPod = result.pods.find(p => p.cubeId === "Pop1");
    expect(popPod?.playerIds[0].startsWith("B")).toBe(true);
    
    const midPod = result.pods.find(p => p.cubeId === "Mid1");
    expect(midPod?.playerIds[0].startsWith("C")).toBe(true);
  });

  it("round 2: bonus drops to 0, score becomes exactly 52.0", () => {
    // Round 2 uses the next batch of 3 cubes
    const r2Cubes = buildCubes().slice(3, 6); // Pop2, Mid2, Unpop2
    const result = runOptimizedRound(buildPlayers(), r2Cubes, {
      roundNumber: 2,
      podCount: 3,
      // usedCubeIds not strictly needed since we manually slice the available cubes, but good practice
      usedCubeIds: ["Pop1", "Mid1", "Unpop1"]
    });

    expect(result.totalScore).toBeCloseTo(52.0, 4);
    expect(result.avoidCount).toBe(0);
  });

  it("handles 3 full rounds properly without avoids and maintains correct groups", () => {
    let players = buildPlayers();
    const allCubes = buildCubes();
    const usedCubes: string[] = [];

    // Simple deterministic MP update: Group A gets +3, Group B +2, Group C +1
    // This ensures groups stay bundled together in standings for R2 & R3 pod formation.
    function updateStandings(round: number) {
      players = players.map(p => {
        let pts = 0;
        if (p.id.startsWith("A")) pts = 3 * round;
        if (p.id.startsWith("B")) pts = 2 * round;
        if (p.id.startsWith("C")) pts = 1 * round;
        return { ...p, matchPoints: pts };
      });
    }

    for (let round = 1; round <= 3; round++) {
      // For R1, MP is 0. Update happens after round.
      const result = runOptimizedRound(players, allCubes, {
        roundNumber: round,
        podCount: 3,
        usedCubeIds: [...usedCubes],
      });

      expect(result.avoidCount).toBe(0);

      const r1ExpectedScore = 124.0;
      const r2r3ExpectedScore = 52.0;

      if (round === 1) expect(result.totalScore).toBeCloseTo(r1ExpectedScore, 4);
      else expect(result.totalScore).toBeCloseTo(r2r3ExpectedScore, 4);

      result.pods.forEach(pod => usedCubes.push(pod.cubeId));
      
      updateStandings(round); // Prepare match points for next round
    }

    expect(usedCubes.length).toBe(9);
    expect(new Set(usedCubes).size).toBe(9); // All different cubes
  });
});
