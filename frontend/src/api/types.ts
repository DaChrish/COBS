export interface Tournament {
  id: string;
  name: string;
  status: "SETUP" | "VOTING" | "DRAFTING" | "FINISHED";
  join_code: string;
  max_rounds: number;
  is_test: boolean;
  seed: number | null;
  player_count: number;
  cube_count: number;
}

export interface TournamentDetail extends Tournament {
  players: TournamentPlayer[];
  cubes: TournamentCube[];
}

export interface TournamentPlayer {
  id: string;
  user_id: string;
  username: string;
  match_points: number;
  game_wins: number;
  game_losses: number;
  dropped: boolean;
}

export interface TournamentCube {
  id: string;
  cube_id: string;
  cube_name: string;
  cube_description: string;
  cube_image_url: string | null;
  cube_artist: string | null;
  max_players: number | null;
}

export interface Cube {
  id: string;
  cubecobra_id: string | null;
  name: string;
  description: string;
  image_url: string | null;
  artist: string | null;
  max_players: number | null;
}

export interface Vote {
  tournament_cube_id: string;
  cube_name: string;
  vote: "DESIRED" | "NEUTRAL" | "AVOID";
}

export interface CubeVoteSummary {
  tournament_cube_id: string;
  cube_name: string;
  desired: number;
  neutral: number;
  avoid: number;
  votes: { username: string; vote: string }[];
}

export interface Draft {
  id: string;
  round_number: number;
  status: "PENDING" | "ACTIVE" | "FINISHED";
  pods: Pod[];
}

export interface Pod {
  id: string;
  pod_number: number;
  pod_size: number;
  cube_name: string;
  cube_id: string;
  timer_ends_at: string | null;
  players: PodPlayer[];
}

export interface PodPlayer {
  tournament_player_id: string;
  username: string;
  seat_number: number;
  vote: "DESIRED" | "NEUTRAL" | "AVOID" | null;
  match_points: number;
}

export interface Match {
  id: string;
  pod_id: string;
  swiss_round: number;
  player1_id: string;
  player1_username: string;
  player2_id: string | null;
  player2_username: string | null;
  player1_wins: number;
  player2_wins: number;
  is_bye: boolean;
  reported: boolean;
  has_conflict: boolean;
  p1_reported_p1_wins: number | null;
  p1_reported_p2_wins: number | null;
  p2_reported_p1_wins: number | null;
  p2_reported_p2_wins: number | null;
}

export interface StandingsEntry {
  player_id: string;
  username: string;
  match_points: number;
  match_wins: number;
  match_losses: number;
  match_draws: number;
  game_wins: number;
  game_losses: number;
  omw_percent: number;
  gw_percent: number;
  ogw_percent: number;
  dropped: boolean;
}

export interface PlayerPhotoStatus {
  tournament_player_id: string;
  user_id: string;
  username: string;
  pool: string | null;
  deck: string | null;
  returned: string | null;
}

export interface DraftPhotoStatus {
  total_players: number;
  pool_deck_ready: number;
  returned_ready: number;
  players: PlayerPhotoStatus[];
}

export interface SimulationPodPlayer {
  id: string;
  username: string;
  vote: string;
  match_points: number;
}

export interface SimulationPod {
  cube_id: string;
  cube_name: string;
  players: SimulationPodPlayer[];
  desired: number;
  neutral: number;
  avoid: number;
  standings_diff: number;
}

export interface BatchAnalysis {
  id: string;
  label: string;
  num_players: number;
  num_cubes: number;
  max_rounds: number;
  swiss_rounds_per_draft: number;
  num_simulations: number;
  vote_distribution: { desired: number; neutral: number; avoid: number };
  player_profiles: { count: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[];
  optimizer_config: Record<string, number>;
  avg_desired_pct: number;
  avg_neutral_pct: number;
  avg_avoid_pct: number;
  min_desired_pct: number;
  max_desired_pct: number;
  min_avoid_pct: number;
  max_avoid_pct: number;
  simulations: {
    desired_pct: number; neutral_pct: number; avoid_pct: number;
    total_desired: number; total_neutral: number; total_avoid: number;
    drafts?: { round: number; desired_pct: number; neutral_pct: number; avoid_pct: number }[];
  }[];
  total_time_ms: number;
  created_at: string | null;
}

export interface Simulation {
  id: string;
  tournament_id: string;
  label: string;
  config: Record<string, number>;
  result: { pods: SimulationPod[] };
  total_desired: number;
  total_neutral: number;
  total_avoid: number;
  objective_score: number;
  max_standings_diff: number;
  player_count: number;
  pod_count: number;
  solver_time_ms: number;
  created_at: string | null;
}
