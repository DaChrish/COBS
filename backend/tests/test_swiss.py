from cobs.logic.swiss import generate_swiss_pairings, _circular_distance


def test_circular_distance():
    assert _circular_distance(1, 5, 8) == 4  # max distance in 8-pod
    assert _circular_distance(1, 2, 8) == 1
    assert _circular_distance(1, 8, 8) == 1  # wraps around
    assert _circular_distance(1, 4, 6) == 3  # max distance in 6-pod
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


def test_round2_seat_distance_tiebreaker():
    """Within same point group, prefer max seat distance."""
    # 8-player pod, all same points, round 1 was crosspod (1v5, 2v6, 3v7, 4v8)
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

    seat_map = {p["id"]: p["seat_number"] for p in players}
    total_distance = 0
    for p in result.pairings:
        s1 = seat_map[p.player1_id]
        s2 = seat_map[p.player2_id]
        dist = _circular_distance(s1, s2, 8)
        total_distance += dist
    # With seat tiebreaker, total distance should be higher than adjacent pairings
    # Adjacent would be: 1v2, 3v4, 5v6, 7v8 = total 4
    # Good would be: 1v4, 2v7, 3v8, 5v6 or similar with higher distances
    assert total_distance > 4


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
