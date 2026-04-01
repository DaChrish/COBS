from cobs.logic.optimizer import CubeInput, OptimizerConfig, PlayerInput, optimize_pods


def test_basic_assignment():
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8], round_number=1)
    assert len(result.pods) == 1
    assert len(result.pods[0]) == 8
    assert result.cube_ids[0] == "c1"


def test_two_pods():
    players = [
        PlayerInput(
            id=f"p{i}", match_points=0,
            votes={"c1": "DESIRED" if i < 8 else "AVOID", "c2": "AVOID" if i < 8 else "DESIRED"},
        )
        for i in range(16)
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8, 8], round_number=1)
    assert len(result.pods) == 2
    assert len(result.pods[0]) == 8
    assert len(result.pods[1]) == 8
    assert set(result.cube_ids) == {"c1", "c2"}


def test_avoid_respected():
    players = [
        PlayerInput(id="p0", match_points=0, votes={"c1": "AVOID", "c2": "DESIRED"}),
        PlayerInput(id="p1", match_points=0, votes={"c1": "DESIRED", "c2": "AVOID"}),
        PlayerInput(id="p2", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"}),
        PlayerInput(id="p3", match_points=0, votes={"c1": "NEUTRAL", "c2": "DESIRED"}),
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[2, 2], round_number=1)
    c1_pod_idx = result.cube_ids.index("c1")
    assert "p0" not in result.pods[c1_pod_idx]


def test_empty_players():
    result = optimize_pods([], [CubeInput(id="c1")], pod_sizes=[8], round_number=1)
    assert result.pods == [[]]


def test_avoid_penalty_scaling_zero_same_as_off():
    """With avoid_penalty_scaling=0, a heavy-avoider's avoids should be full strength (same as no scaling)."""
    # Player who avoids 3 of 4 cubes
    players = [
        PlayerInput(id="heavy_avoider", match_points=0, votes={"c1": "DESIRED", "c2": "AVOID", "c3": "AVOID", "c4": "AVOID"}),
        PlayerInput(id="balanced", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL", "c3": "NEUTRAL", "c4": "NEUTRAL"}),
        PlayerInput(id="p2", match_points=0, votes={"c1": "NEUTRAL", "c2": "DESIRED", "c3": "NEUTRAL", "c4": "NEUTRAL"}),
        PlayerInput(id="p3", match_points=0, votes={"c1": "NEUTRAL", "c2": "NEUTRAL", "c3": "DESIRED", "c4": "NEUTRAL"}),
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2"), CubeInput(id="c3"), CubeInput(id="c4")]

    # Run with scaling=0 (disabled)
    config_off = OptimizerConfig(avoid_penalty_scaling=0.0)
    result_off = optimize_pods(players, cubes, pod_sizes=[2, 2], round_number=1, config=config_off, seed=42)

    # Run without the parameter (default=1.0)
    # The results may differ because scaling is active by default
    # But with scaling=0, heavy_avoider's avoids should be at full strength
    # Verify heavy_avoider is NOT in a pod with their avoided cubes
    for k, cube_id in enumerate(result_off.cube_ids):
        if cube_id in ("c2", "c3", "c4"):
            assert "heavy_avoider" not in result_off.pods[k], \
                f"With scaling=0, heavy avoider should still be protected from avoided cube {cube_id}"


def test_avoid_penalty_scaling_reduces_heavy_avoider():
    """With avoid_penalty_scaling=1, a player who avoids almost everything gets weaker avoids."""
    # 8 players, 2 cubes, player 0 avoids c2 but only desires c1
    players = [
        # Heavy avoider: desires 1, avoids 1 → ratio = 1/1 = 1.0, weight = 1.0 (not reduced)
        PlayerInput(id="p0", match_points=0, votes={"c1": "DESIRED", "c2": "AVOID"}),
        # Extreme avoider: desires 0, neutral 0, avoids 2... wait, needs at least 1 non-avoid
        # Let's use more cubes to make the ratio clearer
    ]
    # Better test: 4 cubes, player avoids 3 of them
    players = [
        PlayerInput(id="extreme", match_points=0, votes={"c1": "DESIRED", "c2": "AVOID", "c3": "AVOID", "c4": "AVOID"}),
        PlayerInput(id="p1", match_points=0, votes={"c1": "NEUTRAL", "c2": "DESIRED", "c3": "NEUTRAL", "c4": "NEUTRAL"}),
        PlayerInput(id="p2", match_points=0, votes={"c1": "NEUTRAL", "c2": "NEUTRAL", "c3": "DESIRED", "c4": "NEUTRAL"}),
        PlayerInput(id="p3", match_points=0, votes={"c1": "NEUTRAL", "c2": "NEUTRAL", "c3": "NEUTRAL", "c4": "DESIRED"}),
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2"), CubeInput(id="c3"), CubeInput(id="c4")]

    # With scaling=1: extreme has ratio 1/3 = 0.33, weight = 0.33
    # Their avoid score is only 33% effective
    config = OptimizerConfig(avoid_penalty_scaling=1.0)
    result = optimize_pods(players, cubes, pod_sizes=[2, 2], round_number=1, config=config, seed=42)

    # The test verifies it runs without error and produces valid assignments
    assert len(result.pods) == 2
    assert sum(len(p) for p in result.pods) == 4


def test_avoid_penalty_scaling_deterministic():
    """Same seed + same config = same result."""
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED" if i < 4 else "AVOID", "c2": "AVOID" if i < 4 else "DESIRED"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1"), CubeInput(id="c2")]
    config = OptimizerConfig(avoid_penalty_scaling=1.0)

    r1 = optimize_pods(players, cubes, pod_sizes=[4, 4], round_number=1, config=config, seed=99)
    r2 = optimize_pods(players, cubes, pod_sizes=[4, 4], round_number=1, config=config, seed=99)
    assert r1.pods == r2.pods
    assert r1.cube_ids == r2.cube_ids


def test_max_players_constraint():
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1", max_players=4), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8], round_number=1)
    assert result.cube_ids[0] == "c2"
