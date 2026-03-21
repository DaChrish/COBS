"""Standings and tiebreaker calculations. Port of swiss.ts tiebreaker logic."""

from dataclasses import dataclass, field
from cobs.logic.swiss import MatchResult


@dataclass
class PlayerStats:
    match_points: int = 0
    match_wins: int = 0
    match_losses: int = 0
    match_draws: int = 0
    game_wins: int = 0
    game_losses: int = 0


@dataclass
class StandingsEntry:
    player_id: str
    match_points: int = 0
    match_wins: int = 0
    match_losses: int = 0
    match_draws: int = 0
    game_wins: int = 0
    game_losses: int = 0
    omw_percent: float = 0.33
    gw_percent: float = 0.33
    ogw_percent: float = 0.33
    dropped: bool = False


def calculate_points(results: list[MatchResult]) -> dict[str, PlayerStats]:
    stats: dict[str, PlayerStats] = {}

    def get(pid: str) -> PlayerStats:
        if pid not in stats:
            stats[pid] = PlayerStats()
        return stats[pid]

    for r in results:
        p1 = get(r.player1_id)
        if r.is_bye:
            p1.match_points += 3
            p1.match_wins += 1
            p1.game_wins += 2
            continue
        if not r.player2_id:
            continue

        p2 = get(r.player2_id)
        p1.game_wins += r.player1_wins
        p1.game_losses += r.player2_wins
        p2.game_wins += r.player2_wins
        p2.game_losses += r.player1_wins

        if r.player1_wins > r.player2_wins:
            p1.match_points += 3
            p1.match_wins += 1
            p2.match_losses += 1
        elif r.player2_wins > r.player1_wins:
            p2.match_points += 3
            p2.match_wins += 1
            p1.match_losses += 1
        else:
            p1.match_points += 1
            p2.match_points += 1
            p1.match_draws += 1
            p2.match_draws += 1

    return stats


def calculate_standings(
    player_ids: list[str],
    results: list[MatchResult],
    dropped_ids: set[str] | None = None,
) -> list[StandingsEntry]:
    if dropped_ids is None:
        dropped_ids = set()

    stats = calculate_points(results)

    opponents: dict[str, list[str]] = {}
    rounds_played: dict[str, int] = {}

    for r in results:
        rounds_played[r.player1_id] = rounds_played.get(r.player1_id, 0) + 1
        if r.player2_id:
            rounds_played[r.player2_id] = rounds_played.get(r.player2_id, 0) + 1
        if r.is_bye or not r.player2_id:
            continue
        opponents.setdefault(r.player1_id, []).append(r.player2_id)
        opponents.setdefault(r.player2_id, []).append(r.player1_id)

    def match_win_pct(pid: str) -> float:
        s = stats.get(pid)
        rp = rounds_played.get(pid, 0)
        if not s or rp == 0:
            return 0.33
        return max(s.match_points / (rp * 3), 0.33)

    def game_win_pct(pid: str) -> float:
        s = stats.get(pid)
        if not s:
            return 0.33
        total = s.game_wins + s.game_losses
        if total == 0:
            return 0.33
        return max(s.game_wins / total, 0.33)

    entries: list[StandingsEntry] = []
    for pid in player_ids:
        s = stats.get(pid, PlayerStats())
        opps = opponents.get(pid, [])

        omw = sum(match_win_pct(o) for o in opps) / len(opps) if opps else 0.33
        gw = game_win_pct(pid)
        ogw = sum(game_win_pct(o) for o in opps) / len(opps) if opps else 0.33

        entries.append(StandingsEntry(
            player_id=pid, match_points=s.match_points,
            match_wins=s.match_wins, match_losses=s.match_losses, match_draws=s.match_draws,
            game_wins=s.game_wins, game_losses=s.game_losses,
            omw_percent=round(omw, 4), gw_percent=round(gw, 4), ogw_percent=round(ogw, 4),
            dropped=pid in dropped_ids,
        ))

    entries.sort(
        key=lambda e: (not e.dropped, e.match_points, e.omw_percent, e.gw_percent, e.ogw_percent),
        reverse=True,
    )
    return entries
