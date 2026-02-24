import {
  runSimulation,
  SimulationConfig,
} from "../src/lib/algorithm/simulation";

const config: SimulationConfig = {
  playerCount: parseInt(process.argv[2] ?? "64"),
  cubeCount: parseInt(process.argv[3] ?? "24"),
  draftRounds: 3,
  swissRoundsPerDraft: 3,
  desiredRate: 0.3,
  avoidRate: 0.2,
  seed: parseInt(process.argv[4] ?? "42"),
};

console.log("=== Turnier-Simulation ===\n");
console.log(`Spieler: ${config.playerCount}`);
console.log(`Cubes: ${config.cubeCount}`);
console.log(`Draft-Runden: ${config.draftRounds}`);
console.log(`Swiss-Runden pro Draft: ${config.swissRoundsPerDraft}`);
console.log(`Seed: ${config.seed}`);
console.log(`DESIRED-Rate: ${(config.desiredRate * 100).toFixed(0)}%`);
console.log(`AVOID-Rate: ${(config.avoidRate * 100).toFixed(0)}%`);
console.log("");

(async () => {
  const stats = await runSimulation(config);

  console.log("=== Ergebnisse ===\n");
  console.log(`Pods insgesamt: ${stats.totalPods}`);
  console.log(
    `DESIRED Zuweisungen: ${stats.desiredAssignments} (${(stats.desiredRate * 100).toFixed(1)}%)`
  );
  console.log(`NEUTRAL Zuweisungen: ${stats.neutralAssignments}`);
  console.log(
    `AVOID Zuweisungen: ${stats.avoidAssignments} (${(stats.avoidRate * 100).toFixed(1)}%)`
  );
  console.log(`Fallbacks verwendet: ${stats.fallbacksUsed}`);

  console.log("\n=== Pod-Größen pro Draft ===\n");
  for (let i = 0; i < stats.podSizesPerDraft.length; i++) {
    console.log(`Draft ${i + 1}: [${stats.podSizesPerDraft[i].join(", ")}]`);
  }

  console.log("\n=== Draft-Details ===\n");
  for (const draft of stats.draftDetails) {
    console.log(`--- Draft ${draft.draftNumber} ---`);
    for (const pod of draft.pods) {
      console.log(
        `  Pod ${pod.podNumber}: ${pod.cubeId} | ${pod.playerCount} Spieler | ` +
          `👍${pod.desiredVoters} 👎${pod.avoidVoters}`
      );
    }
  }

  if (stats.warnings.length > 0) {
    console.log("\n=== Warnungen ===\n");
    for (const w of stats.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }

  console.log("\n=== Simulation abgeschlossen ===");
})();
