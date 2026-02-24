import {
  PlayerInput,
  CubeInput,
  PodAssignment,
  RoundResult,
} from "./types";
import { calculatePodSizes } from "./brunswikian";

// Delegiert an externen Optimizer-Service (FastAPI + OR-Tools). Kein lokaler Fallback.

let EARLY_ROUND_UNPOPULAR_BONUS = 3;
let SCORE_WANT = 5.0;
let SCORE_NEUTRAL = 0.0;
let SCORE_AVOID = -200.0;
let MATCH_POINT_PENALTY_WEIGHT = 10000;
let LOWER_STANDING_BONUS = 0.3;
let REPEAT_AVOID_MULTIPLIER = 4.0;

/** Request body für den Python-Optimizer-Service (FastAPI). */
type OptimizerServiceRequest = {
  players: Array<{
    id: string;
    matchPoints: number;
    votes: Record<string, string>;
    dropped?: boolean;
    priorAvoidCount?: number;
  }>;
  cubes: Array<{ id: string; maxPlayers?: number }>;
  podSizes: number[];
  roundNumber: number;
  earlyRoundBonus: number;
  scoreWant: number;
  scoreAvoid: number;
  scoreNeutral: number;
  matchPointPenaltyWeight: number;
  lowerStandingBonus: number;
  repeatAvoidMultiplier: number;
};

/** Response des Python-Optimizer-Services. */
type OptimizerServiceResponse = {
  pods: string[][];
  cubeIds: (string | null)[];
  objective: number;
};

export async function runOptimizedRound(
  players: PlayerInput[],
  cubes: CubeInput[],
  opts: {
    roundNumber?: number;
    podCount?: number;
    usedCubeIds?: string[];
  } = {}
): Promise<RoundResult> {
  const {
    roundNumber = 1,
    podCount: requestedPodCount,
    usedCubeIds = [],
  } = opts;

  const activePlayers = players.filter((p) => !p.dropped);
  const podSizes = calculatePodSizes(activePlayers.length);
  const podCount = requestedPodCount ?? podSizes.length;
  const sizesToSend = podSizes.slice(0, podCount);

  let available = cubes.filter((c) => !usedCubeIds.includes(c.id));
  if (available.length < podCount) {
    const refill = cubes.filter((c) => usedCubeIds.includes(c.id));
    available = [...available, ...refill];
  }

  const OPTIMIZER_URL =
    process.env.OPTIMIZER_URL ?? "http://localhost:8000";

  const payload: OptimizerServiceRequest = {
    players: activePlayers.map((p) => ({
      id: p.id,
      matchPoints: p.matchPoints,
      votes: p.votes as Record<string, string>,
      dropped: p.dropped,
      priorAvoidCount: p.priorAvoidCount ?? 0,
    })),
    cubes: available.map((c) => ({ id: c.id })),
    podSizes: sizesToSend,
    roundNumber,
    earlyRoundBonus: EARLY_ROUND_UNPOPULAR_BONUS,
    scoreWant: SCORE_WANT,
    scoreAvoid: SCORE_AVOID,
    scoreNeutral: SCORE_NEUTRAL,
    matchPointPenaltyWeight: MATCH_POINT_PENALTY_WEIGHT,
    lowerStandingBonus: LOWER_STANDING_BONUS,
    repeatAvoidMultiplier: REPEAT_AVOID_MULTIPLIER,
  };

  const pingRes = await fetch(`${OPTIMIZER_URL}/health`, {
    method: "GET",
    signal: AbortSignal.timeout(2000),
  });
  if (!pingRes.ok) {
    throw new Error(`Optimizer health check failed: ${pingRes.status}`);
  }
  console.log(`[optimizer] Round ${roundNumber}: ping OK, calling ${OPTIMIZER_URL}/optimize (${activePlayers.length} players, ${available.length} cubes, ${sizesToSend.length} pods)`);

  const response = await fetch(`${OPTIMIZER_URL}/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Optimizer error: ${await response.text()}`);
  }

  const raw: OptimizerServiceResponse = await response.json();
  console.log(
    `[optimizer] Round ${roundNumber}: service OK, objective=${raw.objective}`
  );
  return mapServiceResponseToRoundResult(
    raw,
    sizesToSend,
    roundNumber,
    activePlayers
  );
}

function mapServiceResponseToRoundResult(
  raw: OptimizerServiceResponse,
  podSizes: number[],
  roundNumber: number,
  activePlayers: PlayerInput[]
): RoundResult {
  const playerById = new Map(activePlayers.map((p) => [p.id, p]));
  let wantCount = 0;
  let avoidCount = 0;

  const pods: PodAssignment[] = raw.pods.map((playerIds, k) => {
    const cubeId = raw.cubeIds[k] ?? "";
    const size = podSizes[k] ?? playerIds.length;
    for (const pid of playerIds) {
      const p = playerById.get(pid);
      const vote = p?.votes[cubeId];
      if (vote === "DESIRED") wantCount += 1;
      if (vote === "AVOID") avoidCount += 1;
    }
    return {
      podNumber: k + 1,
      podSize: size,
      cubeId,
      playerIds,
    };
  });

  return {
    roundNumber,
    pods,
    totalScore: raw.objective,
    avoidCount,
    wantCount,
  };
}

export function setEarlyRoundUnpopularBonus(value: number): void {
  EARLY_ROUND_UNPOPULAR_BONUS = value;
}

export function setScoreWant(value: number): void {
  SCORE_WANT = value;
}

export function setScoreAvoid(value: number): void {
  SCORE_AVOID = value;
}

export function setScoreNeutral(value: number): void {
  SCORE_NEUTRAL = value;
}

export function setMatchPointPenaltyWeight(value: number): void {
  MATCH_POINT_PENALTY_WEIGHT = value;
}

export function setLowerStandingBonus(value: number): void {
  LOWER_STANDING_BONUS = value;
}

export function setRepeatAvoidMultiplier(value: number): void {
  REPEAT_AVOID_MULTIPLIER = value;
}
