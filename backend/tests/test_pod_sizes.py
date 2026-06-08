from cobs.logic.pod_sizes import calculate_pod_sizes


def test_8_players():
    assert calculate_pod_sizes(8) == [8]


def test_16_players():
    assert calculate_pod_sizes(16) == [8, 8]


def test_24_players():
    assert calculate_pod_sizes(24) == [8, 8, 8]


def test_9_players():
    assert calculate_pod_sizes(9) == [9]


def test_10_players():
    assert calculate_pod_sizes(10) == [10]


def test_12_players():
    assert calculate_pod_sizes(12) == [6, 6]


def test_15_players():
    assert calculate_pod_sizes(15) == [7, 8]


def test_17_players():
    assert calculate_pod_sizes(17) == [9, 8]


def test_2_players():
    assert calculate_pod_sizes(2) == [2]


def test_1_player():
    assert calculate_pod_sizes(1) == [1]


def test_seats_always_sum_to_player_count():
    """Pod sizes MUST sum to the player count — otherwise the optimizer is
    INFEASIBLE and silently returns empty pods (regression: 20/36/52 players)."""
    for n in range(8, 101):
        sizes = calculate_pod_sizes(n)
        assert sum(sizes) == n, f"{n} players -> {sizes} sums to {sum(sizes)}"


def test_regression_counts_congruent_4_mod_16():
    # These counts hit Python's banker's-rounding bug (round(x.5) -> even).
    assert calculate_pod_sizes(20) == [6, 6, 8]
    assert calculate_pod_sizes(36) == [6, 6, 8, 8, 8]
    assert calculate_pod_sizes(52) == [6, 6, 8, 8, 8, 8, 8]
