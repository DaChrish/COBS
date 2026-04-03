"""
Batch tournament simulator — pure logic, no DB, no FastAPI.
Generates random votes, runs optimizer + Swiss for multiple draft rounds,
and collects assignment statistics.
"""

import random
from dataclasses import dataclass, field

from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods
from cobs.logic.pod_sizes import calculate_pod_sizes
from cobs.logic.swiss import generate_swiss_pairings


@dataclass
class VoteDistribution:
    desired: float = 0.4
    neutral: float = 0.3
    avoid: float = 0.3


@dataclass
class PlayerProfile:
    count: int = 1
    desired_pct: float = 0.1
    neutral_pct: float = 0.0
    avoid_pct: float = 0.9


@dataclass
class TournamentConfig:
    num_players: int = 16
    num_cubes: int = 4
    max_rounds: int = 3
    swiss_rounds_per_draft: int = 3
    vote_distribution: VoteDistribution = field(default_factory=VoteDistribution)
    player_profiles: list[PlayerProfile] = field(default_factory=list)
    optimizer_config: dict = field(default_factory=dict)


def _generate_votes(
    player_ids: list[str],
    cube_ids: list[str],
    default_dist: VoteDistribution,
    profiles: list[PlayerProfile],
    rng: random.Random,
) -> dict[str, dict[str, str]]:
    """Generate votes for all players. Profile players first, rest use default."""
    votes: dict[str, dict[str, str]] = {}
    choices = ["DESIRED", "NEUTRAL", "AVOID"]

    idx = 0
    for profile in profiles:
        for _ in range(profile.count):
            if idx >= len(player_ids):
                break
            pid = player_ids[idx]
            weights = [profile.desired_pct, profile.neutral_pct, profile.avoid_pct]
            votes[pid] = {
                cid: rng.choices(choices, weights=weights, k=1)[0]
                for cid in cube_ids
            }
            idx += 1

    default_weights = [default_dist.desired, default_dist.neutral, default_dist.avoid]
    for i in range(idx, len(player_ids)):
        pid = player_ids[i]
        votes[pid] = {
            cid: rng.choices(choices, weights=default_weights, k=1)[0]
            for cid in cube_ids
        }

    return votes


def _simulate_swiss_matches(
    pod_player_ids: list[str],
    num_rounds: int,
    rng: random.Random,
) -> dict[str, int]:
    """Simulate Swiss rounds within a pod. Returns {player_id: match_points}."""
    match_points = {pid: 0 for pid in pod_player_ids}
    previous_matches: list[dict] = []
    previous_byes: list[str] = []

    # Result distribution: (p1_wins, p2_wins)
    # 30% 2-0, 40% 2-1, 20% 1-2, 10% 0-2
    result_options = [(2, 0), (2, 1), (1, 2), (0, 2)]
    result_weights = [0.30, 0.40, 0.20, 0.10]

    for _round in range(num_rounds):
        players = [
            {"id": pid, "match_points": match_points[pid], "seat_number": i + 1}
            for i, pid in enumerate(pod_player_ids)
        ]
        result = generate_swiss_pairings(players, previous_matches, previous_byes)

        for pairing in result.pairings:
            if pairing.is_bye:
                match_points[pairing.player1_id] += 3
                previous_byes.append(pairing.player1_id)
                previous_matches.append({
                    "player1_id": pairing.player1_id,
                    "player2_id": None,
                })
            else:
                p1_wins, p2_wins = rng.choices(result_options, weights=result_weights, k=1)[0]
                if p1_wins > p2_wins:
                    match_points[pairing.player1_id] += 3
                elif p2_wins > p1_wins:
                    match_points[pairing.player2_id] += 3
                else:
                    match_points[pairing.player1_id] += 1
                    match_points[pairing.player2_id] += 1
                previous_matches.append({
                    "player1_id": pairing.player1_id,
                    "player2_id": pairing.player2_id,
                })

    return match_points


def _select_cubes_for_round(
    all_cube_ids: list[str],
    num_needed: int,
    used_cube_ids: set[str],
    rng: random.Random,
) -> list[str]:
    """Select cubes for a round, preferring unused ones. Refill if needed."""
    unused = [c for c in all_cube_ids if c not in used_cube_ids]
    rng.shuffle(unused)

    if len(unused) >= num_needed:
        return unused[:num_needed]

    # Not enough unused — take all unused plus refill from all
    selected = list(unused)
    remaining_pool = [c for c in all_cube_ids if c not in set(selected)]
    rng.shuffle(remaining_pool)
    selected.extend(remaining_pool[: num_needed - len(selected)])
    return selected


def simulate_tournament(config: TournamentConfig, seed: int) -> dict:
    """Run a full tournament simulation. Pure logic, deterministic per seed."""
    rng = random.Random(seed)

    cube_ids = [f"cube_{i}" for i in range(config.num_cubes)]
    player_ids = [f"p{i}" for i in range(config.num_players)]

    # Build optimizer config
    opt_cfg = OptimizerConfig()
    for key, value in config.optimizer_config.items():
        if hasattr(opt_cfg, key):
            setattr(opt_cfg, key, value)

    opt_config_dict = {
        "score_want": opt_cfg.score_want,
        "score_avoid": opt_cfg.score_avoid,
        "score_neutral": opt_cfg.score_neutral,
        "early_round_bonus": opt_cfg.early_round_bonus,
        "lower_standing_bonus": opt_cfg.lower_standing_bonus,
        "repeat_avoid_multiplier": opt_cfg.repeat_avoid_multiplier,
        "avoid_penalty_scaling": opt_cfg.avoid_penalty_scaling,
        "avoid_penalty_formula": opt_cfg.avoid_penalty_formula,
    }

    # Generate votes
    votes = _generate_votes(player_ids, cube_ids, config.vote_distribution, config.player_profiles, rng)

    # Track state across rounds
    standings: dict[str, int] = {pid: 0 for pid in player_ids}
    prior_avoid_counts: dict[str, int] = {pid: 0 for pid in player_ids}
    used_cubes: set[str] = set()

    drafts = []
    total_desired = 0
    total_neutral = 0
    total_avoid = 0

    for round_num in range(1, config.max_rounds + 1):
        pod_sizes = calculate_pod_sizes(config.num_players)
        num_pods = len(pod_sizes)

        # Select cubes for this round
        round_cubes = _select_cubes_for_round(cube_ids, num_pods, used_cubes, rng)
        used_cubes.update(round_cubes)

        # Build inputs
        player_inputs = [
            PlayerInput(
                id=pid,
                match_points=standings[pid],
                votes=votes[pid],
                prior_avoid_count=prior_avoid_counts[pid],
            )
            for pid in player_ids
        ]
        cube_inputs = [CubeInput(id=cid) for cid in round_cubes]

        # Run optimizer
        result = optimize_pods(
            players=player_inputs,
            cubes=cube_inputs,
            pod_sizes=pod_sizes,
            round_number=round_num,
            config=opt_cfg,
            seed=rng.randint(0, 2**31 - 1),
        )

        # Analyze assignments
        round_desired = 0
        round_neutral = 0
        round_avoid = 0
        pod_details = []

        for pod_idx, (pod_players, cube_id) in enumerate(zip(result.pods, result.cube_ids)):
            pod_d = 0
            pod_n = 0
            pod_a = 0
            for pid in pod_players:
                vote = votes[pid].get(cube_id, "NEUTRAL") if cube_id else "NEUTRAL"
                if vote == "DESIRED":
                    pod_d += 1
                elif vote == "AVOID":
                    pod_a += 1
                    prior_avoid_counts[pid] += 1
                else:
                    pod_n += 1
            round_desired += pod_d
            round_neutral += pod_n
            round_avoid += pod_a
            pod_details.append({
                "pod": pod_idx + 1,
                "cube": cube_id,
                "size": len(pod_players),
                "desired": pod_d,
                "neutral": pod_n,
                "avoid": pod_a,
                "players": [
                    {"id": pid, "vote": votes[pid].get(cube_id, "NEUTRAL") if cube_id else "NEUTRAL", "match_points": standings[pid]}
                    for pid in pod_players
                ],
            })

        total_players = round_desired + round_neutral + round_avoid
        drafts.append({
            "round": round_num,
            "desired_pct": round(round_desired / total_players * 100) if total_players else 0,
            "neutral_pct": round(round_neutral / total_players * 100) if total_players else 0,
            "avoid_pct": round(round_avoid / total_players * 100) if total_players else 0,
            "objective": result.objective,
            "solver_status": result.status,
            "solver_time": round(result.wall_time, 3),
            "pods": pod_details,
        })

        total_desired += round_desired
        total_neutral += round_neutral
        total_avoid += round_avoid

        # Simulate Swiss matches within each pod
        for pod_idx, pod_players in enumerate(result.pods):
            if len(pod_players) < 2:
                continue
            pod_standings = _simulate_swiss_matches(pod_players, config.swiss_rounds_per_draft, rng)
            for pid, pts in pod_standings.items():
                standings[pid] += pts

    # Summary
    grand_total = total_desired + total_neutral + total_avoid
    total_objective = sum(d["objective"] for d in drafts)
    summary = {
        "desired_pct": round(total_desired / grand_total * 100, 1) if grand_total else 0,
        "neutral_pct": round(total_neutral / grand_total * 100, 1) if grand_total else 0,
        "avoid_pct": round(total_avoid / grand_total * 100, 1) if grand_total else 0,
        "total_desired": total_desired,
        "total_neutral": total_neutral,
        "total_avoid": total_avoid,
        "objective": total_objective,
    }

    # Build vote summary per cube
    cube_vote_summary = []
    for cid in cube_ids:
        d = sum(1 for pid in player_ids if votes[pid].get(cid) == "DESIRED")
        n = sum(1 for pid in player_ids if votes[pid].get(cid) == "NEUTRAL")
        a = sum(1 for pid in player_ids if votes[pid].get(cid) == "AVOID")
        cube_vote_summary.append({"cube": cid, "desired": d, "neutral": n, "avoid": a})

    # Build per-player vote map (only D/A for compactness)
    player_votes = {}
    for pid in player_ids:
        player_votes[pid] = {cid: v for cid, v in votes[pid].items() if v != "NEUTRAL"}

    return {
        "player_count": config.num_players,
        "cube_count": config.num_cubes,
        "max_rounds": config.max_rounds,
        "config": opt_config_dict,
        "drafts": drafts,
        "summary": summary,
        "cube_votes": cube_vote_summary,
        "player_votes": player_votes,
    }
