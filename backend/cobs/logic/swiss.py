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

    # Round 2+: Swiss with seat-distance tiebreaker
    # Group by match points
    paired: set[str] = set()
    remaining = list(players_to_match)

    # Build seat map for distance calculation
    seat_map = {p["id"]: p.get("seat_number", 0) for p in players}

    for i in range(len(remaining)):
        if remaining[i]["id"] in paired:
            continue

        p1 = remaining[i]
        best_match = None
        best_distance = -1

        # Find best opponent: same points preferred, then max seat distance, no repeat
        for j in range(i + 1, len(remaining)):
            if remaining[j]["id"] in paired:
                continue
            pair_key = "-".join(sorted([p1["id"], remaining[j]["id"]]))
            if pair_key in played_pairs:
                continue

            p2 = remaining[j]
            dist = _circular_distance(seat_map.get(p1["id"], 0), seat_map.get(p2["id"], 0), pod_size)

            # Prefer same points, then max distance
            if best_match is None:
                best_match = p2
                best_distance = dist
            elif p2["match_points"] == p1["match_points"] and best_match["match_points"] != p1["match_points"]:
                # This opponent has same points, previous didn't — prefer this one
                best_match = p2
                best_distance = dist
            elif p2["match_points"] == best_match["match_points"] and dist > best_distance:
                # Same point group, better distance
                best_match = p2
                best_distance = dist

        # Fallback: allow repeat pairings
        if best_match is None:
            for j in range(i + 1, len(remaining)):
                if remaining[j]["id"] not in paired:
                    best_match = remaining[j]
                    warnings.append(f"Repeat pairing: {p1['id']} vs {remaining[j]['id']}")
                    break

        if best_match:
            paired.add(p1["id"])
            paired.add(best_match["id"])
            pairings.append(SwissPairing(player1_id=p1["id"], player2_id=best_match["id"], is_bye=False))

    return SwissResult(pairings=pairings, warnings=warnings)
