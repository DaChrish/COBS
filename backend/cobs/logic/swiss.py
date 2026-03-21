"""Swiss pairing algorithm. Port of src/lib/algorithm/swiss.ts."""

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


def generate_swiss_pairings(
    players: list[dict],
    previous_matches: list[dict],
    previous_byes: list[str],
) -> SwissResult:
    warnings: list[str] = []
    pairings: list[SwissPairing] = []

    if not players:
        return SwissResult(pairings=[], warnings=["No players for pairings."])

    played_pairs: set[str] = set()
    for m in previous_matches:
        if m.get("player2_id"):
            key = "-".join(sorted([m["player1_id"], m["player2_id"]]))
            played_pairs.add(key)

    sorted_players = sorted(players, key=lambda p: p["match_points"], reverse=True)

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

    paired: set[str] = set()
    remaining = list(players_to_match)

    for i in range(len(remaining)):
        if remaining[i]["id"] in paired:
            continue

        p1 = remaining[i]
        best_match = None

        for j in range(i + 1, len(remaining)):
            if remaining[j]["id"] in paired:
                continue
            pair_key = "-".join(sorted([p1["id"], remaining[j]["id"]]))
            if pair_key not in played_pairs:
                best_match = remaining[j]
                break

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
