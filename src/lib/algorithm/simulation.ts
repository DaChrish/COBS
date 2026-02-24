import { PlayerInput, CubeInput, Vote, MatchResult } from "./types";
import { runOptimizedRound } from "./tournamentOptimizer";
import { generateSwissPairings, calculatePointsFromResults } from "./swiss";

export interface SimulationConfig {
  playerCount: number;
  cubeCount: number;
  draftRounds: number;
  swissRoundsPerDraft: number;
  /** Anteil der DESIRED-Stimmen (0-1) */
  desiredRate: number;
  /** Anteil der AVOID-Stimmen (0-1) */
  avoidRate: number;
  seed?: number;
}

export interface SimulationStats {
  totalPods: number;
  desiredAssignments: number;
  neutralAssignments: number;
  avoidAssignments: number;
  desiredRate: number;
  avoidRate: number;
  fallbacksUsed: number;
  warnings: string[];
  podSizesPerDraft: number[][];
  draftDetails: DraftDetail[];
  /** Spieler-ID → Cube-ID → Vote (die ursprüngliche Stimmenmatrix) */
  voteMatrix: Record<string, Record<string, Vote>>;
  /** Alle Cube-IDs/Namen */
  cubes: { id: string; name: string }[];
  /** Spieler-ID → Name */
  playerNames: Record<string, string>;
  /** Spieler-Standings am Ende */
  finalStandings: SimPlayerStanding[];
}

export interface SimPlayerStanding {
  playerId: string;
  name: string;
  matchPoints: number;
  /** Pro Draft: welcher Cube und wie war die Original-Stimme */
  assignments: Array<{
    draftNumber: number;
    cubeId: string;
    cubeName: string;
    originalVote: Vote;
    podNumber: number;
  }>;
}

export interface DraftDetail {
  draftNumber: number;
  pods: SimPodDetail[];
}

export interface SimPodDetail {
  podNumber: number;
  cubeId: string;
  cubeName: string;
  playerCount: number;
  desiredVoters: number;
  neutralVoters: number;
  avoidVoters: number;
  players: Array<{
    playerId: string;
    name: string;
    originalVote: Vote;
    matchPointsBefore: number;
  }>;
}

// Einfacher Pseudo-Zufallsgenerator (seedbar); LCG mit seed als Startwert
function createRng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function generateRandomVotes(
  playerCount: number,
  cubeIds: string[],
  desiredRate: number,
  avoidRate: number,
  rng: () => number
): Record<string, Record<string, Vote>> {
  const votes: Record<string, Record<string, Vote>> = {};

  for (let i = 0; i < playerCount; i++) {
    const playerId = `player_${i}`;
    votes[playerId] = {};

    for (const cubeId of cubeIds) {
      const r = rng();
      if (r < desiredRate) {
        votes[playerId][cubeId] = "DESIRED";
      } else if (r < desiredRate + avoidRate) {
        votes[playerId][cubeId] = "AVOID";
      } else {
        votes[playerId][cubeId] = "NEUTRAL";
      }
    }
  }

  return votes;
}

function simulateMatchResult(rng: () => number): [number, number] {
  // Simuliere 2-0 oder 2-1 Match (kein Unentschieden für Einfachheit)
  const p1skill = rng();
  const p2skill = rng();
  if (p1skill > p2skill) {
    return rng() > 0.4 ? [2, 0] : [2, 1];
  } else {
    return rng() > 0.4 ? [0, 2] : [1, 2];
  }
}

export async function runSimulation(
  config: SimulationConfig = {
    playerCount: 64,
    cubeCount: 24,
    draftRounds: 3,
    swissRoundsPerDraft: 3,
    desiredRate: 0.3,
    avoidRate: 0.2,
  }
): Promise<SimulationStats> {
  const rng = createRng(config.seed ?? Date.now());

  const cubes: CubeInput[] = Array.from({ length: config.cubeCount }, (_, i) => ({
    id: `cube_${i}`,
    name: `Cube ${i + 1}`,
  }));

  const cubeIds = cubes.map((c) => c.id);
  const allVotes = generateRandomVotes(
    config.playerCount,
    cubeIds,
    config.desiredRate,
    config.avoidRate,
    rng
  );

  let players: PlayerInput[] = Array.from(
    { length: config.playerCount },
    (_, i) => ({
      id: `player_${i}`,
      matchPoints: 0,
      gameWins: 0,
      gameLosses: 0,
      dropped: false,
      votes: allVotes[`player_${i}`],
    })
  );

  const playerNames: Record<string, string> = {};
  for (let i = 0; i < config.playerCount; i++) {
    playerNames[`player_${i}`] = `Spieler ${i + 1}`;
  }

  const cubeNames: Record<string, string> = {};
  for (const c of cubes) cubeNames[c.id] = c.name;

  // Zuweisungs-Tracking pro Spieler
  const playerAssignments: Record<string, SimPlayerStanding["assignments"]> = {};
  for (const p of players) playerAssignments[p.id] = [];

  const stats: SimulationStats = {
    totalPods: 0,
    desiredAssignments: 0,
    neutralAssignments: 0,
    avoidAssignments: 0,
    desiredRate: 0,
    avoidRate: 0,
    fallbacksUsed: 0,
    warnings: [],
    podSizesPerDraft: [],
    draftDetails: [],
    voteMatrix: allVotes,
    cubes: cubes.map((c) => ({ id: c.id, name: c.name })),
    playerNames,
    finalStandings: [],
  };

  const usedCubeIds: string[] = [];

  for (let draft = 0; draft < config.draftRounds; draft++) {
    let result: { pods: { podNumber: number; podSize: number; cubeId: string; playerIds: string[] }[]; warnings: string[] };
    const roundResult = await runOptimizedRound(players, cubes, {
      roundNumber: draft + 1,
      usedCubeIds: [...usedCubeIds],
    });
    result = { pods: roundResult.pods, warnings: [] };
    stats.warnings.push(...result.warnings);
    stats.totalPods += result.pods.length;
    stats.podSizesPerDraft.push(result.pods.map((p) => p.podSize));

    const draftDetail: DraftDetail = {
      draftNumber: draft + 1,
      pods: [],
    };

    for (const pod of result.pods) {
      usedCubeIds.push(pod.cubeId);

      let desiredVoters = 0;
      let neutralVoters = 0;
      let avoidVoters = 0;
      const podPlayers: SimPodDetail["players"] = [];

      for (const playerId of pod.playerIds) {
        const originalVote = allVotes[playerId]?.[pod.cubeId] ?? "NEUTRAL";
        const matchPointsBefore = players.find((p) => p.id === playerId)?.matchPoints ?? 0;

        if (originalVote === "DESIRED") {
          stats.desiredAssignments++;
          desiredVoters++;
        } else if (originalVote === "AVOID") {
          stats.avoidAssignments++;
          avoidVoters++;
        } else {
          stats.neutralAssignments++;
          neutralVoters++;
        }

        podPlayers.push({
          playerId,
          name: playerNames[playerId],
          originalVote,
          matchPointsBefore,
        });

        playerAssignments[playerId].push({
          draftNumber: draft + 1,
          cubeId: pod.cubeId,
          cubeName: cubeNames[pod.cubeId],
          originalVote,
          podNumber: pod.podNumber,
        });
      }

      draftDetail.pods.push({
        podNumber: pod.podNumber,
        cubeId: pod.cubeId,
        cubeName: cubeNames[pod.cubeId],
        playerCount: pod.playerIds.length,
        desiredVoters,
        neutralVoters,
        avoidVoters,
        players: podPlayers,
      });

      // Swiss-Runden simulieren
      const swissPlayers = pod.playerIds.map((id) => ({
        id,
        matchPoints: players.find((p) => p.id === id)?.matchPoints ?? 0,
      }));
      const allMatches: MatchResult[] = [];
      const previousByes: string[] = [];

      for (let round = 0; round < config.swissRoundsPerDraft; round++) {
        const { pairings, warnings } = generateSwissPairings(
          swissPlayers,
          allMatches,
          previousByes
        );
        stats.warnings.push(...warnings);

        for (const pairing of pairings) {
          if (pairing.isBye) {
            previousByes.push(pairing.player1Id);
            allMatches.push({
              player1Id: pairing.player1Id,
              player2Id: null,
              player1Wins: 2,
              player2Wins: 0,
              isBye: true,
            });
            continue;
          }

          const [p1w, p2w] = simulateMatchResult(rng);
          allMatches.push({
            player1Id: pairing.player1Id,
            player2Id: pairing.player2Id,
            player1Wins: p1w,
            player2Wins: p2w,
            isBye: false,
          });
        }

        // Punkte aktualisieren
        const points = calculatePointsFromResults(allMatches);
        for (const pp of swissPlayers) {
          const p = points.get(pp.id);
          if (p) pp.matchPoints = p.matchPoints;
        }
      }

      // Hauptstandings aktualisieren
      const finalPoints = calculatePointsFromResults(allMatches);
      for (const playerId of pod.playerIds) {
        const player = players.find((p) => p.id === playerId);
        const pts = finalPoints.get(playerId);
        if (player && pts) {
          player.matchPoints += pts.matchPoints;
          player.gameWins += pts.gameWins;
          player.gameLosses += pts.gameLosses;
        }
      }
    }

    stats.fallbacksUsed += result.warnings.filter((w) =>
      w.includes("Fallback")
    ).length;

    stats.draftDetails.push(draftDetail);
  }

  const totalAssignments =
    stats.desiredAssignments +
    stats.neutralAssignments +
    stats.avoidAssignments;

  stats.desiredRate =
    totalAssignments > 0 ? stats.desiredAssignments / totalAssignments : 0;
  stats.avoidRate =
    totalAssignments > 0 ? stats.avoidAssignments / totalAssignments : 0;

  // Endstanedings aufbauen
  stats.finalStandings = players
    .map((p) => ({
      playerId: p.id,
      name: playerNames[p.id],
      matchPoints: p.matchPoints,
      assignments: playerAssignments[p.id],
    }))
    .sort((a, b) => b.matchPoints - a.matchPoints);

  return stats;
}
