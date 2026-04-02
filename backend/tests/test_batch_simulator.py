from cobs.logic.batch_simulator import (
    PlayerProfile,
    TournamentConfig,
    VoteDistribution,
    simulate_tournament,
)


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
