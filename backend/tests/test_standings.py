from cobs.logic.standings import calculate_points, calculate_standings
from cobs.logic.swiss import MatchResult


def test_calculate_points_win():
    results = [MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False)]
    stats = calculate_points(results)
    assert stats["a"].match_points == 3
    assert stats["b"].match_points == 0
    assert stats["a"].game_wins == 2
    assert stats["b"].game_losses == 2


def test_calculate_points_draw():
    results = [MatchResult(player1_id="a", player2_id="b", player1_wins=1, player2_wins=1, is_bye=False)]
    stats = calculate_points(results)
    assert stats["a"].match_points == 1
    assert stats["b"].match_points == 1
    assert stats["a"].match_draws == 1


def test_calculate_points_bye():
    results = [MatchResult(player1_id="a", player2_id=None, player1_wins=0, player2_wins=0, is_bye=True)]
    stats = calculate_points(results)
    assert stats["a"].match_points == 3
    assert stats["a"].game_wins == 2


def test_standings_order():
    results = [
        MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False),
        MatchResult(player1_id="c", player2_id="d", player1_wins=2, player2_wins=1, is_bye=False),
    ]
    standings = calculate_standings(["a", "b", "c", "d"], results)
    assert standings[0].player_id in ("a", "c")
    assert standings[1].player_id in ("a", "c")
    assert standings[2].player_id in ("b", "d")


def test_dropped_sorted_last():
    results = [MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False)]
    standings = calculate_standings(["a", "b"], results, dropped_ids={"a"})
    assert standings[0].player_id == "b"
    assert standings[1].dropped is True


def test_omw_minimum_33():
    results = [MatchResult(player1_id="a", player2_id="b", player1_wins=2, player2_wins=0, is_bye=False)]
    standings = calculate_standings(["a", "b"], results)
    for s in standings:
        assert s.omw_percent >= 0.33
        assert s.gw_percent >= 0.33
        assert s.ogw_percent >= 0.33
