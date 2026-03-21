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


def test_max_players_constraint():
    players = [
        PlayerInput(id=f"p{i}", match_points=0, votes={"c1": "DESIRED", "c2": "NEUTRAL"})
        for i in range(8)
    ]
    cubes = [CubeInput(id="c1", max_players=4), CubeInput(id="c2")]
    result = optimize_pods(players, cubes, pod_sizes=[8], round_number=1)
    assert result.cube_ids[0] == "c2"
