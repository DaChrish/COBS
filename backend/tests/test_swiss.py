from cobs.logic.swiss import generate_swiss_pairings


def test_8_players():
    players = [{"id": f"p{i}", "match_points": 0} for i in range(8)]
    result = generate_swiss_pairings(players, [], [])
    assert len(result.pairings) == 4
    assert all(not p.is_bye for p in result.pairings)


def test_odd_players_bye():
    players = [{"id": f"p{i}", "match_points": 0} for i in range(7)]
    result = generate_swiss_pairings(players, [], [])
    byes = [p for p in result.pairings if p.is_bye]
    assert len(byes) == 1
    assert len(result.pairings) == 4


def test_bye_not_repeated():
    players = [{"id": f"p{i}", "match_points": 3 if i < 6 else 0} for i in range(7)]
    result = generate_swiss_pairings(players, [], ["p6"])
    bye = [p for p in result.pairings if p.is_bye][0]
    assert bye.player1_id != "p6"


def test_avoid_repeat_pairings():
    players = [
        {"id": "p0", "match_points": 3},
        {"id": "p1", "match_points": 3},
        {"id": "p2", "match_points": 0},
        {"id": "p3", "match_points": 0},
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
