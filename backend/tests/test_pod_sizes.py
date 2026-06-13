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
    assert calculate_pod_sizes(15) == [8, 7]


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
    # Largest pod first so the top-standing players get a full 8-player pod.
    assert calculate_pod_sizes(20) == [8, 6, 6]
    assert calculate_pod_sizes(36) == [8, 8, 8, 6, 6]
    assert calculate_pod_sizes(52) == [8, 8, 8, 8, 8, 6, 6]


def test_pod_sizes_are_non_increasing():
    """Sizes MUST be ordered largest-first. The optimizer slices players sorted
    by standing (best first) into pods in this order, so the FIRST pod gets the
    best-standing players. If a smaller pod came first, the round-1 winners would
    land in an incomplete pod instead of a full 8 (regression: live Braunschweig 2)."""
    for n in range(8, 101):
        sizes = calculate_pod_sizes(n)
        assert sizes == sorted(sizes, reverse=True), f"{n} players -> {sizes} not largest-first"


def test_top_pod_is_full_when_a_full_pod_exists():
    """When the player count admits at least one full 8-pod, the top pod must be 8 —
    the best-standing players always get a complete pod."""
    for n in range(8, 101):
        sizes = calculate_pod_sizes(n)
        if any(s >= 8 for s in sizes):
            assert sizes[0] >= 8, f"{n} players -> {sizes} top pod not full"


def test_46_players_live_scenario():
    # The exact live case: 46 players. Top pod must be a full 8, remainder (6) last.
    assert calculate_pod_sizes(46) == [8, 8, 8, 8, 8, 6]
