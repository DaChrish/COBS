export type Vote = "DESIRED" | "NEUTRAL" | "AVOID";

export interface PlayerInput {
  id: string;
  matchPoints: number;
  gameWins: number;
  gameLosses: number;
  dropped: boolean;
  votes: Record<string, Vote>; // cubeId -> vote
  /** Optional: used by BandB for snake draft and variance; falls back to matchPoints if absent. */
  skill?: number;
  /** How many times this player was assigned an AVOID cube in previous rounds. */
  priorAvoidCount?: number;
}

export interface CubeInput {
  id: string;
  name: string;
  /** Maximum number of players this cube supports (null/undefined = no limit). */
  maxPlayers?: number;
}

export interface PodAssignment {
  podNumber: number;
  podSize: number;
  cubeId: string;
  playerIds: string[];
  /** MatchPoints pro Spieler zum Zeitpunkt der Pod-Bildung (tournament optimizer). */
  playerMatchPoints?: Record<string, number>;
}

/** Ergebnis einer einzelnen Runde (tournament optimizer). */
export interface RoundResult {
  roundNumber: number;
  pods: PodAssignment[];
  totalScore: number;
  avoidCount: number;
  wantCount: number;
}

/** Gesamtergebnis über alle Runden (tournament optimizer). */
export interface TournamentResult {
  rounds: RoundResult[];
  warnings: string[];
  totalScore: number;
}

export interface BrunswickianResult {
  pods: PodAssignment[];
  warnings: string[];
}

/** Global vote counts for one cube across all (non-dropped) players. */
export interface CubeVoteSummary {
  cubeId: string;
  cubeName: string;
  desired: number;
  neutral: number;
  avoid: number;
}

export interface SwissPairing {
  player1Id: string;
  player2Id: string | null;
  isBye: boolean;
}

export interface SwissRoundResult {
  pairings: SwissPairing[];
  warnings: string[];
}

export interface MatchResult {
  player1Id: string;
  player2Id: string | null;
  player1Wins: number;
  player2Wins: number;
  isBye: boolean;
}

export interface StandingsEntry {
  playerId: string;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  /** Opponent Match Win % */
  omwPercent: number;
  /** Game Win % */
  gwPercent: number;
  /** Opponent Game Win % */
  ogwPercent: number;
}
