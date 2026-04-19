from cobs.logic.swiss import generate_swiss_pairings, _circular_distance


def _simulate_tournament(pod_size: int, num_rounds: int, winner_rule):
    """Run a full Swiss tournament for a pod and return all played pair keys.

    winner_rule(p1_id, p2_id, round_idx) -> "p1" | "p2" | "draw"
    determines how each match resolves, which shapes the point distribution
    and thus exercises the pairing algorithm under different orderings.
    """
    players = [
        {"id": f"p{i}", "match_points": 0, "seat_number": i}
        for i in range(1, pod_size + 1)
    ]
    previous_matches: list[dict] = []
    previous_byes: list[str] = []
    all_warnings: list[str] = []
    played_keys: list[str] = []

    for round_idx in range(num_rounds):
        result = generate_swiss_pairings(players, previous_matches, previous_byes)
        all_warnings.extend(result.warnings)

        for pairing in result.pairings:
            if pairing.is_bye:
                previous_byes.append(pairing.player1_id)
                for pl in players:
                    if pl["id"] == pairing.player1_id:
                        pl["match_points"] += 3
                continue

            p1_id = pairing.player1_id
            p2_id = pairing.player2_id
            played_keys.append("-".join(sorted([p1_id, p2_id])))
            previous_matches.append({"player1_id": p1_id, "player2_id": p2_id})

            outcome = winner_rule(p1_id, p2_id, round_idx)
            for pl in players:
                if pl["id"] == p1_id:
                    pl["match_points"] += 3 if outcome == "p1" else (1 if outcome == "draw" else 0)
                elif pl["id"] == p2_id:
                    pl["match_points"] += 3 if outcome == "p2" else (1 if outcome == "draw" else 0)

    return played_keys, all_warnings


def _assert_no_rematches(played_keys: list[str]) -> None:
    assert len(played_keys) == len(set(played_keys)), (
        f"rematch detected in sequence: {played_keys}"
    )


def _lower_seat_wins(p1_id, p2_id, _round_idx):
    return "p1" if int(p1_id[1:]) < int(p2_id[1:]) else "p2"


def _higher_seat_wins(p1_id, p2_id, _round_idx):
    return "p1" if int(p1_id[1:]) > int(p2_id[1:]) else "p2"


def _all_draws(_p1_id, _p2_id, _round_idx):
    return "draw"


def _alternating(p1_id, p2_id, round_idx):
    if round_idx % 2 == 0:
        return "p1" if int(p1_id[1:]) < int(p2_id[1:]) else "p2"
    return "p1" if int(p1_id[1:]) > int(p2_id[1:]) else "p2"


def test_circular_distance():
    assert _circular_distance(1, 5, 8) == 4
    assert _circular_distance(1, 2, 8) == 1
    assert _circular_distance(1, 8, 8) == 1
    assert _circular_distance(1, 4, 6) == 3
    assert _circular_distance(3, 6, 6) == 3


def test_8_players_round1_crosspod():
    """Round 1: seat 1 vs 5, 2 vs 6, 3 vs 7, 4 vs 8."""
    players = [{"id": f"p{i}", "match_points": 0, "seat_number": i} for i in range(1, 9)]
    result = generate_swiss_pairings(players, [], [])
    assert len(result.pairings) == 4
    assert all(not p.is_bye for p in result.pairings)

    # Check crosspod: each pair should have seat distance of 4
    seat_map = {f"p{i}": i for i in range(1, 9)}
    for p in result.pairings:
        s1 = seat_map[p.player1_id]
        s2 = seat_map[p.player2_id]
        assert _circular_distance(s1, s2, 8) == 4


def test_6_players_round1_crosspod():
    """Round 1 with 6 players: seat 1 vs 4, 2 vs 5, 3 vs 6."""
    players = [{"id": f"p{i}", "match_points": 0, "seat_number": i} for i in range(1, 7)]
    result = generate_swiss_pairings(players, [], [])
    assert len(result.pairings) == 3

    seat_map = {f"p{i}": i for i in range(1, 7)}
    for p in result.pairings:
        s1 = seat_map[p.player1_id]
        s2 = seat_map[p.player2_id]
        assert _circular_distance(s1, s2, 6) == 3


def test_round2_swiss_by_points():
    """Round 2: pair by points, not seats."""
    players = [
        {"id": "p1", "match_points": 3, "seat_number": 1},
        {"id": "p2", "match_points": 3, "seat_number": 2},
        {"id": "p3", "match_points": 0, "seat_number": 3},
        {"id": "p4", "match_points": 0, "seat_number": 4},
    ]
    prev = [{"player1_id": "p1", "player2_id": "p3"}, {"player1_id": "p2", "player2_id": "p4"}]
    result = generate_swiss_pairings(players, prev, [])

    # Winners should play winners, losers play losers
    for p in result.pairings:
        if not p.is_bye:
            p1_pts = next(pl for pl in players if pl["id"] == p.player1_id)["match_points"]
            p2_pts = next(pl for pl in players if pl["id"] == p.player2_id)["match_points"]
            assert p1_pts == p2_pts


def test_round2_standard_swiss():
    """Round 2+: standard Swiss by points, no seat tiebreaker."""
    # 8-player pod, all same points — should still pair without error
    players = [
        {"id": f"p{i}", "match_points": 3, "seat_number": i}
        for i in range(1, 9)
    ]
    prev = [
        {"player1_id": "p1", "player2_id": "p5"},
        {"player1_id": "p2", "player2_id": "p6"},
        {"player1_id": "p3", "player2_id": "p7"},
        {"player1_id": "p4", "player2_id": "p8"},
    ]
    result = generate_swiss_pairings(players, prev, [])
    assert len(result.pairings) == 4
    # All pairings should avoid repeats from round 1
    for p in result.pairings:
        key = "-".join(sorted([p.player1_id, p.player2_id]))
        assert key not in {"-".join(sorted([m["player1_id"], m["player2_id"]])) for m in prev}


def test_odd_players_bye():
    players = [{"id": f"p{i}", "match_points": 0, "seat_number": i} for i in range(1, 8)]
    result = generate_swiss_pairings(players, [], [])
    byes = [p for p in result.pairings if p.is_bye]
    assert len(byes) == 1
    assert len(result.pairings) == 4


def test_bye_not_repeated():
    players = [{"id": f"p{i}", "match_points": 3 if i < 7 else 0, "seat_number": i} for i in range(1, 8)]
    result = generate_swiss_pairings(players, [], ["p7"])
    bye = [p for p in result.pairings if p.is_bye][0]
    assert bye.player1_id != "p7"


def test_avoid_repeat_pairings():
    players = [
        {"id": "p0", "match_points": 3, "seat_number": 1},
        {"id": "p1", "match_points": 3, "seat_number": 2},
        {"id": "p2", "match_points": 0, "seat_number": 3},
        {"id": "p3", "match_points": 0, "seat_number": 4},
    ]
    prev = [{"player1_id": "p0", "player2_id": "p1"}]
    result = generate_swiss_pairings(players, prev, [])
    for p in result.pairings:
        if not p.is_bye:
            key = "-".join(sorted([p.player1_id, p.player2_id]))
            assert key != "-".join(sorted(["p0", "p1"]))


def test_empty_players():
    result = generate_swiss_pairings([], [], [])
    assert len(result.pairings) == 0
    assert len(result.warnings) > 0


def test_backwards_compatible_without_seat():
    """Players without seat_number should still work."""
    players = [{"id": f"p{i}", "match_points": 0} for i in range(8)]
    result = generate_swiss_pairings(players, [], [])
    assert len(result.pairings) == 4


# --- Regression tests: no rematches in 3 Swiss rounds for pod sizes 4-10 ---
#
# For N >= 4 and 3 rounds, a rematch-free pairing always exists mathematically
# (C(N,2) >= 3 * floor(N/2)). The backtracking algorithm must find it regardless
# of how points distribute from prior rounds.


import pytest


@pytest.mark.parametrize("pod_size", [4, 5, 6, 7, 8, 9, 10])
@pytest.mark.parametrize(
    "rule,rule_name",
    [
        (_lower_seat_wins, "lower_wins"),
        (_higher_seat_wins, "higher_wins"),
        (_all_draws, "draws"),
        (_alternating, "alternating"),
    ],
)
def test_no_rematches_over_3_rounds(pod_size, rule, rule_name):
    played_keys, warnings = _simulate_tournament(pod_size, 3, rule)
    _assert_no_rematches(played_keys)
    assert not any("Repeat pairing" in w for w in warnings), (
        f"unexpected repeat-pairing warning for pod_size={pod_size}, rule={rule_name}: {warnings}"
    )


def test_4_players_3_rounds_is_round_robin():
    """With exactly 4 players and 3 rounds every pair must play exactly once."""
    played_keys, _ = _simulate_tournament(4, 3, _lower_seat_wins)
    assert len(played_keys) == 6  # 3 rounds * 2 matches
    assert len(set(played_keys)) == 6
    expected_pairs = {
        "-".join(sorted([f"p{a}", f"p{b}"]))
        for a in range(1, 5)
        for b in range(a + 1, 5)
    }
    assert set(played_keys) == expected_pairs


def test_no_rematches_6_players_pathological_points():
    """The original greedy bug scenario: 6 players where R1 winners all win R2
    and the greedy ordering traps the last two players into a rematch."""
    players = [
        {"id": f"p{i}", "match_points": 0, "seat_number": i} for i in range(1, 7)
    ]
    # R1 crosspod: p1-p4, p2-p5, p3-p6. Suppose seats 1-3 all won.
    r1 = [
        {"player1_id": "p1", "player2_id": "p4"},
        {"player1_id": "p2", "player2_id": "p5"},
        {"player1_id": "p3", "player2_id": "p6"},
    ]
    for pl in players:
        if pl["id"] in {"p1", "p2", "p3"}:
            pl["match_points"] = 3

    r2 = generate_swiss_pairings(players, r1, [])
    assert not any("Repeat" in w for w in r2.warnings)
    r2_matches = [
        {"player1_id": p.player1_id, "player2_id": p.player2_id}
        for p in r2.pairings
        if not p.is_bye
    ]
    # Apply R2 results — say p1 and p2 keep winning, p3 loses.
    winners_r2 = {r2_matches[0]["player1_id"], r2_matches[1]["player1_id"]}
    for pl in players:
        if pl["id"] in winners_r2:
            pl["match_points"] += 3

    r3 = generate_swiss_pairings(players, r1 + r2_matches, [])
    assert not any("Repeat" in w for w in r3.warnings)

    all_keys = [
        "-".join(sorted([m["player1_id"], m["player2_id"]])) for m in r1 + r2_matches
    ] + [
        "-".join(sorted([p.player1_id, p.player2_id]))
        for p in r3.pairings
        if not p.is_bye
    ]
    _assert_no_rematches(all_keys)


def test_fallback_emits_warning_when_mathematically_impossible():
    """4 players can support at most 3 unique rounds. A 4th round MUST rematch."""
    played_keys, warnings = _simulate_tournament(4, 4, _lower_seat_wins)
    # First 3 rounds are rematch-free, only round 4 introduces repeats.
    assert any("Repeat pairing" in w for w in warnings)
    assert len(played_keys) == 8
    assert len(set(played_keys)) < 8
