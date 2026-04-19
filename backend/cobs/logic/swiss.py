"""Swiss pairing algorithm with seat-distance tiebreaker for cube draft."""

from dataclasses import dataclass


@dataclass
class SwissPairing:
    player1_id: str
    player2_id: str | None
    is_bye: bool


@dataclass
class SwissResult:
    pairings: list[SwissPairing]
    warnings: list[str]


@dataclass
class MatchResult:
    player1_id: str
    player2_id: str | None
    player1_wins: int
    player2_wins: int
    is_bye: bool


def _circular_distance(seat_a: int, seat_b: int, pod_size: int) -> int:
    """Calculate circular distance between two seats."""
    diff = abs(seat_a - seat_b)
    return min(diff, pod_size - diff)


def generate_swiss_pairings(
    players: list[dict],
    previous_matches: list[dict],
    previous_byes: list[str],
) -> SwissResult:
    """Generate Swiss pairings.

    players: list of {id, match_points, seat_number}
    Round 1 (all 0 points): crosspod pairings by seat (N vs N + pod_size/2)
    Round 2+: Swiss by points, seat distance as tiebreaker within same point group
    """
    warnings: list[str] = []
    pairings: list[SwissPairing] = []

    if not players:
        return SwissResult(pairings=[], warnings=["No players for pairings."])

    is_first_round = not previous_matches
    pod_size = max((p.get("seat_number", 0) for p in players), default=len(players))

    played_pairs: set[str] = set()
    for m in previous_matches:
        if m.get("player2_id"):
            key = "-".join(sorted([m["player1_id"], m["player2_id"]]))
            played_pairs.add(key)

    # Sort by match points descending, then seat number ascending
    sorted_players = sorted(players, key=lambda p: (-p["match_points"], p.get("seat_number", 0)))

    # Handle bye for odd player count
    bye_player = None
    players_to_match = sorted_players

    if len(sorted_players) % 2 != 0:
        for i in range(len(sorted_players) - 1, -1, -1):
            if sorted_players[i]["id"] not in previous_byes:
                bye_player = sorted_players[i]
                players_to_match = [p for j, p in enumerate(sorted_players) if j != i]
                break

        if bye_player is None:
            bye_player = sorted_players[-1]
            players_to_match = sorted_players[:-1]
            warnings.append(f"All players had a bye. {bye_player['id']} gets another.")

        pairings.append(SwissPairing(player1_id=bye_player["id"], player2_id=None, is_bye=True))

    # Round 1: Crosspod pairings (seat N vs seat N + half)
    if is_first_round and all(p.get("seat_number") for p in players_to_match):
        seat_sorted = sorted(players_to_match, key=lambda p: p["seat_number"])
        half = len(seat_sorted) // 2
        for i in range(half):
            p1 = seat_sorted[i]
            p2 = seat_sorted[i + half]
            pairings.append(SwissPairing(player1_id=p1["id"], player2_id=p2["id"], is_bye=False))
        return SwissResult(pairings=pairings, warnings=warnings)

    # Round 2+: Standard Swiss by points. Backtracking search prefers pairing within
    # the same point group and guarantees a rematch-free solution whenever one exists.
    solution = _find_pairing(players_to_match, played_pairs)

    if solution is not None:
        for p1, p2 in solution:
            pairings.append(SwissPairing(player1_id=p1["id"], player2_id=p2["id"], is_bye=False))
        return SwissResult(pairings=pairings, warnings=warnings)

    # No rematch-free pairing exists (e.g. too many rounds for pod size).
    # Fall back to a greedy pairing that permits repeats, emitting warnings.
    fallback = _greedy_pairing_with_repeats(players_to_match, played_pairs, warnings)
    for p1, p2 in fallback:
        pairings.append(SwissPairing(player1_id=p1["id"], player2_id=p2["id"], is_bye=False))

    return SwissResult(pairings=pairings, warnings=warnings)


def _find_pairing(
    players: list[dict], played_pairs: set[str]
) -> list[tuple[dict, dict]] | None:
    """Recursive backtracking search for a rematch-free pairing.

    Players are already sorted by match points desc. To preserve Swiss intent,
    each candidate opponent is tried in order of point-difference ascending,
    so same-point-group pairings are preferred.
    """
    if not players:
        return []

    p1 = players[0]
    rest = players[1:]

    candidates = sorted(
        range(len(rest)),
        key=lambda idx: abs(p1["match_points"] - rest[idx]["match_points"]),
    )

    for idx in candidates:
        p2 = rest[idx]
        pair_key = "-".join(sorted([p1["id"], p2["id"]]))
        if pair_key in played_pairs:
            continue
        remaining = rest[:idx] + rest[idx + 1 :]
        tail = _find_pairing(remaining, played_pairs)
        if tail is not None:
            return [(p1, p2), *tail]

    return None


def _greedy_pairing_with_repeats(
    players: list[dict], played_pairs: set[str], warnings: list[str]
) -> list[tuple[dict, dict]]:
    """Last-resort pairing when no rematch-free solution exists."""
    paired: set[str] = set()
    result: list[tuple[dict, dict]] = []

    for i, p1 in enumerate(players):
        if p1["id"] in paired:
            continue

        best_match = None
        for j in range(i + 1, len(players)):
            p2 = players[j]
            if p2["id"] in paired:
                continue
            pair_key = "-".join(sorted([p1["id"], p2["id"]]))
            if pair_key not in played_pairs:
                best_match = p2
                break

        if best_match is None:
            for j in range(i + 1, len(players)):
                p2 = players[j]
                if p2["id"] not in paired:
                    best_match = p2
                    warnings.append(f"Repeat pairing: {p1['id']} vs {p2['id']}")
                    break

        if best_match is not None:
            paired.add(p1["id"])
            paired.add(best_match["id"])
            result.append((p1, best_match))

    return result
