import random

from cobs.logic.batch_simulator import (
    PlayerProfile,
    TournamentConfig,
    VoteDistribution,
    _select_cubes_for_round,
    simulate_real_vote_rounds,
    simulate_tournament,
)
from cobs.logic.optimizer import OptimizerConfig


def test_select_cubes_refills_when_more_needed_than_available():
    # Fewer distinct cubes than pods: must still return exactly num_needed
    # (with reuse) — otherwise the optimizer is INFEASIBLE → empty pods.
    result = _select_cubes_for_round(["c0", "c1"], 5, set(), random.Random(0))
    assert len(result) == 5
    assert set(result) <= {"c0", "c1"}

    single = _select_cubes_for_round(["c0"], 3, set(), random.Random(0))
    assert single == ["c0", "c0", "c0"]

    assert _select_cubes_for_round([], 4, set(), random.Random(0)) == []


def test_real_vote_rounds_assigns_all_players_when_cubes_lt_pods():
    pids = [f"p{i}" for i in range(48)]  # 48 -> 6 pods
    cube_ids = [f"c{i}" for i in range(4)]  # only 4 cubes
    votes = {pid: {cid: "NEUTRAL" for cid in cube_ids} for pid in pids}
    init_mp = {pid: 0 for pid in pids}
    cube_max = {cid: None for cid in cube_ids}
    rounds = simulate_real_vote_rounds(
        pids, votes, init_mp, cube_ids, cube_max,
        num_rounds=1, swiss_rounds_per_draft=3, config=OptimizerConfig(), seed=1,
    )
    assert sum(p["size"] for p in rounds[0]["pods"]) == 48
    assert rounds[0]["solver_status"] in ("OPTIMAL", "FEASIBLE")


def _real_vote_setup():
    player_ids = [f"p{i}" for i in range(8)]
    cube_ids = [f"c{i}" for i in range(4)]
    votes = {
        pid: {cid: ("DESIRED" if (i + j) % 3 == 0 else "AVOID" if (i + j) % 3 == 1 else "NEUTRAL")
              for j, cid in enumerate(cube_ids)}
        for i, pid in enumerate(player_ids)
    }
    initial_mp = {pid: 0 for pid in player_ids}
    cube_max = {cid: None for cid in cube_ids}
    return player_ids, votes, initial_mp, cube_ids, cube_max


def test_real_vote_rounds_count_and_shape():
    player_ids, votes, initial_mp, cube_ids, cube_max = _real_vote_setup()
    rounds = simulate_real_vote_rounds(
        player_ids, votes, initial_mp, cube_ids, cube_max,
        num_rounds=3, swiss_rounds_per_draft=3,
        config=OptimizerConfig(), seed=7,
    )
    assert len(rounds) == 3
    for i, r in enumerate(rounds):
        assert r["round"] == i + 1
        assert sum(p["size"] for p in r["pods"]) == len(player_ids)


def test_real_vote_rounds_standings_advance():
    # Round 1 everyone enters with 0; later rounds must reflect simulated wins.
    player_ids, votes, initial_mp, cube_ids, cube_max = _real_vote_setup()
    rounds = simulate_real_vote_rounds(
        player_ids, votes, initial_mp, cube_ids, cube_max,
        num_rounds=3, swiss_rounds_per_draft=3,
        config=OptimizerConfig(), seed=7,
    )
    entry_mp_r1 = {p["id"]: p["match_points"] for pod in rounds[0]["pods"] for p in pod["players"]}
    entry_mp_r3 = {p["id"]: p["match_points"] for pod in rounds[2]["pods"] for p in pod["players"]}
    assert all(v == 0 for v in entry_mp_r1.values())
    assert any(v > 0 for v in entry_mp_r3.values())


def _strip_timing(rounds):
    # solver_time is wall-clock and inherently varies between runs.
    return [{k: v for k, v in r.items() if k != "solver_time"} for r in rounds]


def test_real_vote_rounds_deterministic():
    player_ids, votes, initial_mp, cube_ids, cube_max = _real_vote_setup()
    args = (player_ids, votes, initial_mp, cube_ids, cube_max)
    kwargs = dict(num_rounds=3, swiss_rounds_per_draft=3, config=OptimizerConfig(), seed=123)
    r1 = simulate_real_vote_rounds(*args, **kwargs)
    r2 = simulate_real_vote_rounds(*args, **kwargs)
    assert _strip_timing(r1) == _strip_timing(r2)


def test_basic_simulation():
    config = TournamentConfig(
        num_players=8,
        num_cubes=2,
        max_rounds=1,
        swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(desired=0.4, neutral=0.3, avoid=0.3),
        player_profiles=[],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert result["player_count"] == 8
    assert len(result["drafts"]) == 1
    assert (
        result["drafts"][0]["desired_pct"]
        + result["drafts"][0]["neutral_pct"]
        + result["drafts"][0]["avoid_pct"]
        == 100
    )


def test_multi_round():
    config = TournamentConfig(
        num_players=16,
        num_cubes=4,
        max_rounds=3,
        swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(),
        player_profiles=[],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert len(result["drafts"]) == 3


def test_deterministic():
    config = TournamentConfig(
        num_players=8,
        num_cubes=2,
        max_rounds=1,
        swiss_rounds_per_draft=3,
        vote_distribution=VoteDistribution(),
        player_profiles=[],
        optimizer_config={},
    )
    r1 = simulate_tournament(config, seed=99)
    r2 = simulate_tournament(config, seed=99)
    assert r1 == r2


def test_player_profile():
    config = TournamentConfig(
        num_players=8,
        num_cubes=4,
        max_rounds=1,
        swiss_rounds_per_draft=1,
        vote_distribution=VoteDistribution(),
        player_profiles=[
            PlayerProfile(count=2, desired_pct=0.1, neutral_pct=0.0, avoid_pct=0.9),
        ],
        optimizer_config={},
    )
    result = simulate_tournament(config, seed=42)
    assert result["player_count"] == 8


def test_custom_optimizer_config():
    config = TournamentConfig(
        num_players=8,
        num_cubes=2,
        max_rounds=1,
        swiss_rounds_per_draft=1,
        vote_distribution=VoteDistribution(),
        player_profiles=[],
        optimizer_config={"score_avoid": -500.0, "avoid_penalty_scaling": 2.0},
    )
    result = simulate_tournament(config, seed=42)
    assert result["config"]["score_avoid"] == -500.0
