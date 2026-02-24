import {
  PlayerInput,
  CubeInput,
  Vote,
  PodAssignment,
  BrunswickianResult,
  CubeVoteSummary,
} from "./types";

/**
 * Wird gerade nicht verwendet!
 * Berechnet die Anzahl Pods und deren Größen basierend auf der Spieleranzahl.
 * Lookup-Tabelle aus der Präsentation für Pod1/Pod2-Modifikation.
 */
export function calculatePodSizes(playerCount: number): number[] {
  const numPods = Math.round(playerCount / 8);
  if (numPods <= 0) return [playerCount];

  const sizes = new Array(numPods).fill(8);
  const remainder = playerCount % 8;

  const lookupTable: Record<number, [number, number]> = {
    0: [0, 0],
    1: [1, 0],
    2: [2, 0],
    3: [1, 2],
    4: [-2, -2],
    5: [-1, -2],
    6: [-2, 0],
    7: [-1, 0],
  };

  const [mod1, mod2] = lookupTable[remainder] ?? [0, 0];

  // Pod1 = unterster Pod (wird zuerst gebaut), Pod2 = zweitunterster
  sizes[0] += mod1;
  if (numPods > 1) {
    sizes[1] += mod2;
  }

  return sizes;
}

interface InternalPlayer {
  id: string;
  matchPoints: number;
  votes: Record<string, Vote>;
}

/**
 * Zählt die Stimmen eines bestimmten Typs für einen Cube unter den gegebenen Spielern.
 */
function countVotes(
  players: InternalPlayer[],
  cubeId: string,
  voteType: Vote
): number {
  return players.filter((p) => p.votes[cubeId] === voteType).length;
}

/**
 * Zählt die Gesamtanzahl von AVOID-Stimmen eines Spielers über alle Cubes.
 */
function totalAvoidVotes(player: InternalPlayer): number {
  return Object.values(player.votes).filter((v) => v === "AVOID").length;
}

/**
 * Kernalgorithmus: Wählt den besten Cube für einen Pod.
 *
 * 1. Filtere Cubes, bei denen kein Fix-Spieler AVOID gestimmt hat.
 * 2. Minimiere |#DESIRED(verfügbare Spieler) - podSize|.
 * 3. Tiebreaker: Maximiere #AVOID über alle Spieler (unbeliebte Cubes zuerst verbrauchen).
 * 4. Fallback: Falls kein Cube die Fix-Spieler-Bedingung erfüllt, wähle den
 *    "am wenigsten schlechten" Cube (minimiere Fix-Spieler-AVOID-Stimmen).
 */
function selectCubeForPod(
  availableCubes: CubeInput[],
  fixedPlayers: InternalPlayer[],
  allPodCandidates: InternalPlayer[],
  podSize: number,
  allPlayers: InternalPlayer[]
): { cubeId: string; usedFallback: boolean } {
  type CubeScore = {
    cubeId: string;
    fixedAvoidCount: number;
    desiredCount: number;
    desiredDiff: number;
    globalAvoidCount: number;
    maxPlayerAvoid: number;
  };

  const scored: CubeScore[] = availableCubes.map((cube) => {
    const fixedAvoidCount = countVotes(fixedPlayers, cube.id, "AVOID");
    const desiredCount = countVotes(allPodCandidates, cube.id, "DESIRED");
    const desiredDiff = Math.abs(desiredCount - podSize);
    const globalAvoidCount = countVotes(allPlayers, cube.id, "AVOID");
    const maxPlayerAvoid = allPodCandidates.reduce(
      (max, p) => (p.votes[cube.id] === "AVOID" ? Math.max(max, totalAvoidVotes(p)) : max),
      0
    );

    return {
      cubeId: cube.id,
      fixedAvoidCount,
      desiredCount,
      desiredDiff,
      globalAvoidCount,
      maxPlayerAvoid,
    };
  });

  // Versuche zuerst nur Cubes ohne Fix-Spieler-AVOID
  const valid = scored.filter((s) => s.fixedAvoidCount === 0);
  const popularWhenNoFixed =
    fixedPlayers.length === 0
      ? valid.filter((s) => s.desiredCount >= podSize)
      : [];

  const pool =
    popularWhenNoFixed.length > 0
      ? popularWhenNoFixed
      : valid.length > 0
        ? valid
        : scored;
  const usedFallback = valid.length === 0;

  // Sortierung: bester Cube zuerst (pool[0] wird gewählt).
  // 1) Fallback-Modus: Kein Cube ohne Fix-AVOID → wenigsten Fix-AVOID bevorzugen.
  // 2) desiredDiff: Cube, bei dem DESIRED-Anzahl der Kandidaten am nächsten an podSize liegt (ideale Passung).
  // 3) globalAvoidCount absteigend: Cube, den global weniger Leute vermeiden (besser für alle).
  // 4) maxPlayerAvoid absteigend: Cube, den ein „schwieriger“ Kandidat (viele AVOIDs) vermeidet → diesen dort unterbringen.
  pool.sort((a, b) => {
    if (usedFallback && a.fixedAvoidCount !== b.fixedAvoidCount) {
      return a.fixedAvoidCount - b.fixedAvoidCount;
    }
    if (a.desiredDiff !== b.desiredDiff) return a.desiredDiff - b.desiredDiff;
    if (a.globalAvoidCount !== b.globalAvoidCount)
      return b.globalAvoidCount - a.globalAvoidCount;
    return b.maxPlayerAvoid - a.maxPlayerAvoid;
  });

  return { cubeId: pool[0].cubeId, usedFallback };
}

/**
 * Wählt Flex-Spieler für den Pod basierend auf ihrem Vote zum gewählten Cube.
 * Bevorzugt DESIRED, dann NEUTRAL, dann AVOID.
 * Bei Gleichstand: Spieler mit mehr AVOID-Stimmen insgesamt bevorzugen
 * (diese Spieler sind "schwieriger" unterzubringen).
 */
function selectFlexPlayers(
  flexCandidates: InternalPlayer[],
  cubeId: string,
  needed: number
): string[] {
  const voteOrder: Record<Vote, number> = { DESIRED: 0, NEUTRAL: 1, AVOID: 2 };

  const sorted = [...flexCandidates].sort((a, b) => {
    const aVote = a.votes[cubeId] ?? "NEUTRAL";
    const bVote = b.votes[cubeId] ?? "NEUTRAL";
    if (voteOrder[aVote] !== voteOrder[bVote])
      return voteOrder[aVote] - voteOrder[bVote];
    return totalAvoidVotes(b) - totalAvoidVotes(a);
  });

  return sorted.slice(0, needed).map((p) => p.id);
}

/**
 * Hauptfunktion des Brunswikian-Systems.
 * Weist Spieler zu Pods zu und wählt für jeden Pod einen Cube.
 */
export function runBrunswickian(
  players: PlayerInput[],
  cubes: CubeInput[],
  usedCubeIds: string[] = []
): BrunswickianResult {
  const warnings: string[] = [];

  const activePlayers = players.filter((p) => !p.dropped);
  if (activePlayers.length < 2) {
    return { pods: [], warnings: ["Zu wenige aktive Spieler."] };
  }

  const podSizes = calculatePodSizes(activePlayers.length);
  const availableCubes = cubes.filter((c) => !usedCubeIds.includes(c.id));

  if (availableCubes.length < podSizes.length) {
    warnings.push(
      `Nur ${availableCubes.length} Cubes verfügbar für ${podSizes.length} Pods.`
    );
  }

  // Arbeitskopie der Spieler, sortiert nach Punkten aufsteigend
  let remaining: InternalPlayer[] = activePlayers
    .map((p) => ({
      id: p.id,
      matchPoints: p.matchPoints,
      votes: { ...p.votes },
    }))
    .sort((a, b) => a.matchPoints - b.matchPoints);

  let cubesLeft = [...availableCubes];
  const pods: PodAssignment[] = [];

  for (let i = 0; i < podSizes.length; i++) {
    const podSize = podSizes[i];
    if (remaining.length === 0) break;

    // Tatsächliche Pod-Größe darf nicht größer sein als verbleibende Spieler
    const actualPodSize = Math.min(podSize, remaining.length);

    // Wähle Spieler mit den niedrigsten Punkten
    const selected = remaining.slice(0, actualPodSize);
    const podMaxPoint = selected[selected.length - 1].matchPoints;

    // Fix-Spieler: Punkte strikt kleiner als podMaxPoint
    const fixedPlayers = selected.filter((p) => p.matchPoints < podMaxPoint);
    // Flex-Spieler: alle mit podMaxPoint (auch solche die nicht selected sind)
    const flexCandidates = remaining.filter(
      (p) => p.matchPoints === podMaxPoint
    );

    const neededFlexCount = actualPodSize - fixedPlayers.length;

    if (cubesLeft.length === 0) {
      warnings.push(`Kein Cube mehr verfügbar für Pod ${i + 1}.`);
      // Pod trotzdem bauen, ohne Cube-Zuweisung
      pods.push({
        podNumber: i + 1,
        podSize: actualPodSize,
        cubeId: "",
        playerIds: selected.map((p) => p.id),
      });
      remaining = remaining.filter(
        (p) => !selected.some((s) => s.id === p.id)
      );
      continue;
    }

    // Cube-Auswahl
    const allRemaining = [...remaining];
    const { cubeId, usedFallback } = selectCubeForPod(
      cubesLeft,
      fixedPlayers,
      allRemaining,
      actualPodSize,
      remaining
    );

    if (usedFallback) {
      warnings.push(
        `Pod ${i + 1}: Kein Cube ohne Fix-Spieler-AVOID gefunden. Least-bad Fallback verwendet.`
      );
    }

    // Flex-Spieler auswählen
    const selectedFlexIds = selectFlexPlayers(
      flexCandidates,
      cubeId,
      neededFlexCount
    );

    const podPlayerIds = [
      ...fixedPlayers.map((p) => p.id),
      ...selectedFlexIds,
    ];

    // Logging: Warum dieser Pod so befüllt wurde (Algo unverändert)
    const remainingMap = new Map(remaining.map((p) => [p.id, p]));
    const desiredChosen = countVotes(allRemaining, cubeId, "DESIRED");
    const neutralChosen = countVotes(allRemaining, cubeId, "NEUTRAL");
    const avoidChosen = countVotes(allRemaining, cubeId, "AVOID");
    const validCount = cubesLeft.filter(
      (c) => countVotes(fixedPlayers, c.id, "AVOID") === 0
    ).length;
    const popularCount =
      fixedPlayers.length === 0
        ? cubesLeft.filter(
            (c) => countVotes(allRemaining, c.id, "DESIRED") >= actualPodSize
          ).length
        : 0;
    const poolSource =
      popularCount > 0 ? "popular" : validCount > 0 ? "valid" : "scored";
    const playerVotes = podPlayerIds.map((id) => {
      const v = remainingMap.get(id)?.votes[cubeId] ?? "NEUTRAL";
      return { id, vote: v };
    });
    const cubeName = cubesLeft.find((c) => c.id === cubeId)?.name ?? cubeId;
    console.log("[Brunswikian] Pod " + (i + 1) + " (Size " + actualPodSize + "):");
    console.log("  Cube: " + cubeName + " (" + cubeId + ")");
    console.log(
      "  Pool: " +
        poolSource +
        " (popular=" +
        popularCount +
        ", valid=" +
        validCount +
        ", usedFallback=" +
        usedFallback +
        ")"
    );
    console.log(
      "  Among remaining (" +
        allRemaining.length +
        "): DESIRED=" +
        desiredChosen +
        ", NEUTRAL=" +
        neutralChosen +
        ", AVOID=" +
        avoidChosen +
        " (need " +
        actualPodSize +
        ")"
    );
    console.log(
      "  Fixed/Flex: " + fixedPlayers.length + " fixed, " + neededFlexCount + " flex (from " + flexCandidates.length + " candidates)"
    );
    console.log(
      "  Assigned votes for this cube: " +
        JSON.stringify(playerVotes.map((pv) => pv.vote))
    );
    const avoidInPod = playerVotes.filter((pv) => pv.vote === "AVOID").length;
    if (avoidInPod > 0) {
      console.log("  >>> " + avoidInPod + " player(s) with AVOID in this pod.");
    }
    console.log("");

    pods.push({
      podNumber: i + 1,
      podSize: actualPodSize,
      cubeId,
      playerIds: podPlayerIds,
    });

    // Entferne zugewiesene Spieler und den verwendeten Cube
    const assignedSet = new Set(podPlayerIds);
    remaining = remaining.filter((p) => !assignedSet.has(p.id));

    // Setze alle Votes für den verwendeten Cube auf AVOID
    for (const p of remaining) {
      p.votes[cubeId] = "AVOID";
    }

    cubesLeft = cubesLeft.filter((c) => c.id !== cubeId);
  }

  return { pods, warnings };
}

// --- Brunswikian 2.0: nicht sequenziell, unbeliebte Cubes zuerst, max DESIRED/min AVOID, homogene Pods nach Stärke ---

const DESIRED_WEIGHT_V2 = 2;
const AVOID_PENALTY_V2 = 10;

/** Sortierung: unbeliebt zuerst (mehr AVOID, weniger DESIRED). Nur für Tie-Breaker „unbeliebte Cubes verwenden“. */
function sortCubesByUnpopularity(
  cubes: CubeInput[],
  players: InternalPlayer[]
): CubeInput[] {
  return [...cubes].sort((a, b) => {
    const avoidA = countVotes(players, a.id, "AVOID");
    const avoidB = countVotes(players, b.id, "AVOID");
    if (avoidB !== avoidA) return avoidB - avoidA;
    const desiredA = countVotes(players, a.id, "DESIRED");
    const desiredB = countVotes(players, b.id, "DESIRED");
    return desiredA - desiredB;
  });
}

/**
 * Draft 1 (keine Stärke): Pro Pod den unbeliebtesten noch verfügbaren Cube wählen,
 * der im verbleibenden Pool noch mindestens podSize Nicht-AVOID-Spieler hat (→ 0 AVOID wenn möglich).
 * Dann die besten 8 (DESIRED, NEUTRAL, AVOID) für diesen Cube nehmen.
 * Priorität: max DESIRED, min AVOID. Tie-Breaker: unbeliebteste Cubes verwenden.
 */
function assignCubesAndPlayersV2NoStrength(
  availableCubes: CubeInput[],
  players: InternalPlayer[],
  podSizes: number[],
  cubeById: Map<string, CubeInput>
): { cubeIdByPod: string[]; podPlayerIds: string[][] } {
  const K = podSizes.length;
  const cubeIdByPod: string[] = [];
  const podPlayerIds: string[][] = Array(K)
    .fill(null)
    .map(() => []);
  let remainingPlayers = players.map((p) => ({ ...p }));
  let remainingCubes = [...availableCubes];

  for (let p = 0; p < K; p++) {
    const need = podSizes[p];
    if (remainingCubes.length === 0 || remainingPlayers.length < need) break;

    // Unbeliebteste zuerst (Tie-Breaker); unter denen den wählen, der noch ≥ need Nicht-AVOID im Pool hat
    const byUnpopular = sortCubesByUnpopularity(remainingCubes, remainingPlayers);
    let chosenCube: CubeInput | null = null;
    for (const cube of byUnpopular) {
      const nonAvoid = remainingPlayers.filter(
        (pl) => (pl.votes[cube.id] ?? "NEUTRAL") !== "AVOID"
      ).length;
      if (nonAvoid >= need) {
        chosenCube = cube;
        break;
      }
    }
    if (!chosenCube) chosenCube = byUnpopular[0];

    const cube = chosenCube;
    // Beste 8 für diesen Cube: DESIRED, dann NEUTRAL, AVOID nur wenn nötig
    const sorted = [...remainingPlayers].sort((a, b) => {
      const va = a.votes[cube.id] ?? "NEUTRAL";
      const vb = b.votes[cube.id] ?? "NEUTRAL";
      if (va === "AVOID" && vb !== "AVOID") return 1;
      if (va !== "AVOID" && vb === "AVOID") return -1;
      if (va === "DESIRED" && vb !== "DESIRED") return -1;
      if (va !== "DESIRED" && vb === "DESIRED") return 1;
      return 0;
    });
    const chosen = sorted.slice(0, need).map((pl) => pl.id);
    cubeIdByPod.push(cube.id);
    podPlayerIds[p] = chosen;
    const chosenSet = new Set(chosen);
    remainingPlayers = remainingPlayers.filter((pl) => !chosenSet.has(pl.id));
    remainingCubes = remainingCubes.filter((c) => c.id !== cube.id);
  }

  while (cubeIdByPod.length < K) cubeIdByPod.push("");
  return { cubeIdByPod, podPlayerIds };
}

/**
 * Phase 1 mit Stärke (ab Draft 2): Pods bekommen die K unbeliebtesten Cubes (Tie-Breaker).
 * Priorität min AVOID / max DESIRED wird in Phase 2 (Block–Pod-Zuordnung) umgesetzt.
 */
function assignCubesToPodsV2Strength(
  availableCubes: CubeInput[],
  players: InternalPlayer[],
  podCount: number
): string[] {
  const sorted = sortCubesByUnpopularity(availableCubes, players);
  return Array.from({ length: podCount }, (_, i) => (i < sorted.length ? sorted[i].id : ""));
}

/**
 * Phase 2 mit Stärke (ab Draft 2): Spieler nach Punkten in Blöcke, Blöcke den Pods zuordnen.
 * Min AVOID, max DESIRED; Pods mit unbeliebten Cubes zuerst bedienen (beste Blöcke für harte Cubes).
 */
function assignPlayersToPodsV2(
  players: InternalPlayer[],
  podSizes: number[],
  cubeIdByPod: string[],
  cubeById: Map<string, CubeInput>
): string[][] {
  const byStrength = [...players].sort((a, b) => b.matchPoints - a.matchPoints);
  const K = podSizes.length;
  const podPlayerIds: string[][] = Array(K)
    .fill(null)
    .map(() => []);

  let offset = 0;
  const blocks: string[][] = [];
  for (let i = 0; i < K; i++) {
    const size = Math.min(podSizes[i], byStrength.length - offset);
    if (size <= 0) break;
    blocks.push(byStrength.slice(offset, offset + size).map((p) => p.id));
    offset += size;
  }
  for (let i = blocks.length; i < K; i++) blocks.push([]);

  const playerById = new Map(byStrength.map((p) => [p.id, p]));
  // Pro (Pod, Block): AVOID-Anzahl und Nutzen für diesen Pod-Cube
  const pairAvoid = new Map<string, number>();
  const pairUtility = new Map<string, number>();
  for (let p = 0; p < K; p++) {
    const cubeId = cubeIdByPod[p];
    const cube = cubeId ? cubeById.get(cubeId) : null;
    for (let b = 0; b < K; b++) {
      if (blocks[b].length !== podSizes[p]) continue;
      let avoidCount = 0;
      let utility = 0;
      for (const pid of blocks[b]) {
        const pl = playerById.get(pid);
        if (!pl || !cube) continue;
        const v = pl.votes[cube.id] ?? "NEUTRAL";
        if (v === "DESIRED") utility += DESIRED_WEIGHT_V2;
        else if (v === "AVOID") {
          avoidCount++;
          utility -= AVOID_PENALTY_V2;
        }
      }
      pairAvoid.set(`${p},${b}`, avoidCount);
      pairUtility.set(`${p},${b}`, utility);
    }
  }

  // Pods mit unbeliebten Cubes zuerst bedienen (Reihenfolge wie Phase 1: Pod 0 = unbeliebtester Cube).
  // Pro Pod den Block mit wenigsten AVOID wählen (unter noch freien Blöcken), dann nach Nutzen.
  const usedBlock = new Set<number>();
  for (let p = 0; p < K; p++) {
    let bestBlock = -1;
    let bestAvoid = Infinity;
    let bestUtility = -Infinity;
    for (let b = 0; b < K; b++) {
      if (usedBlock.has(b) || blocks[b].length !== podSizes[p]) continue;
      const avoid = pairAvoid.get(`${p},${b}`) ?? 0;
      const util = pairUtility.get(`${p},${b}`) ?? 0;
      if (avoid < bestAvoid || (avoid === bestAvoid && util > bestUtility)) {
        bestAvoid = avoid;
        bestUtility = util;
        bestBlock = b;
      }
    }
    if (bestBlock >= 0) {
      usedBlock.add(bestBlock);
      podPlayerIds[p] = [...blocks[bestBlock]];
    }
  }

  for (let p = 0; p < K; p++) {
    if (
      podPlayerIds[p].length === 0 &&
      blocks.some((bl, j) => !usedBlock.has(j) && bl.length === podSizes[p])
    ) {
      const b = blocks.findIndex((bl, j) => !usedBlock.has(j) && bl.length === podSizes[p]);
      if (b >= 0) {
        usedBlock.add(b);
        podPlayerIds[p] = [...blocks[b]];
      }
    }
  }

  return podPlayerIds;
}

/**
 * Brunswikian 2.0: Gleiche API wie runBrunswickian. Gilt für alle Drafts:
 * - Priorität 1: Möglichst viele DESIRED, wenn irgendmöglich niemand AVOID.
 * - Tie-Breaker: Bei mehreren Möglichkeiten mit gleichem (DESIRED, AVOID) die Lösung wählen,
 *   die die meisten global unbeliebtesten Cubes verwendet.
 * - Draft 1 (alle gleiche Punkte): Pro Pod unbeliebtesten Cube wählen, der noch ≥8 Nicht-AVOID im Pool hat; beste 8 zuweisen.
 * - Ab Draft 2: Stärke-Blöcke; Cubes unbeliebt zuerst (Tie-Breaker), Block–Pod min AVOID / max DESIRED.
 */
export function runBrunswickian2(
  players: PlayerInput[],
  cubes: CubeInput[],
  usedCubeIds: string[] = []
): BrunswickianResult {
  const warnings: string[] = [];
  const activePlayers = players.filter((p) => !p.dropped);
  if (activePlayers.length < 2) {
    return { pods: [], warnings: ["Zu wenige aktive Spieler."] };
  }

  const podSizes = calculatePodSizes(activePlayers.length);
  const availableCubes = cubes.filter((c) => !usedCubeIds.includes(c.id));
  const cubeById = new Map(cubes.map((c) => [c.id, c]));

  const internalPlayers: InternalPlayer[] = activePlayers.map((p) => ({
    id: p.id,
    matchPoints: p.matchPoints,
    votes: { ...p.votes },
  }));

  if (availableCubes.length < podSizes.length) {
    warnings.push(
      `Nur ${availableCubes.length} Cubes für ${podSizes.length} Pods. Einige Pods ohne Cube.`
    );
  }

  const allSamePoints =
    internalPlayers.length > 0 &&
    internalPlayers.every((p) => p.matchPoints === internalPlayers[0].matchPoints);

  let cubeIdByPod: string[];
  let podPlayerIds: string[][];
  if (allSamePoints) {
    const result = assignCubesAndPlayersV2NoStrength(
      availableCubes,
      internalPlayers,
      podSizes,
      cubeById
    );
    cubeIdByPod = result.cubeIdByPod;
    podPlayerIds = result.podPlayerIds;
  } else {
    cubeIdByPod = assignCubesToPodsV2Strength(
      availableCubes,
      internalPlayers,
      podSizes.length
    );
    podPlayerIds = assignPlayersToPodsV2(
      internalPlayers,
      podSizes,
      cubeIdByPod,
      cubeById
    );
  }

  const pods: PodAssignment[] = [];
  for (let i = 0; i < podSizes.length; i++) {
    const playerIds = podPlayerIds[i] ?? [];
    if (playerIds.length === 0 && podSizes[i] > 0) {
      warnings.push(`Pod ${i + 1}: Keine Spieler zugewiesen.`);
    }
    pods.push({
      podNumber: i + 1,
      podSize: podSizes[i],
      cubeId: cubeIdByPod[i] ?? "",
      playerIds,
    });
  }

  return { pods, warnings };
}

/**
 * Listet alle Cubes mit ihren globalen Stimmen (DESIRED, NEUTRAL, AVOID) über alle nicht-dropped Spieler.
 */
export function getGlobalVotesByCube(
  players: PlayerInput[],
  cubes: CubeInput[]
): CubeVoteSummary[] {
  const active = players.filter((p) => !p.dropped);
  return cubes.map((cube) => {
    let desired = 0,
      neutral = 0,
      avoid = 0;
    for (const p of active) {
      const v = p.votes[cube.id] ?? "NEUTRAL";
      if (v === "DESIRED") desired++;
      else if (v === "AVOID") avoid++;
      else neutral++;
    }
    return {
      cubeId: cube.id,
      cubeName: cube.name,
      desired,
      neutral,
      avoid,
    };
  });
}
