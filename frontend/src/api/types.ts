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
  max_players: number | null;
}

export interface Cube {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
}

export interface Vote {
  tournament_cube_id: string;
  cube_name: string;
  vote: "DESIRED" | "NEUTRAL" | "AVOID";
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
