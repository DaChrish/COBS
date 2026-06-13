import math


def calculate_pod_sizes(player_count: int) -> list[int]:
    """Calculate pod sizes from player count. Port of TypeScript calculatePodSizes."""
    if player_count < 8:
        return [player_count]

    # Round half UP to match JS Math.round. Python's built-in round() uses
    # banker's rounding (round-half-to-even), so round(4.5) == 4 while
    # Math.round(4.5) == 5. That divergence produced one pod too few for counts
    # like 20/36/52, making the pod seats sum to LESS than the player count and
    # leaving the optimizer INFEASIBLE (silent empty pods).
    num_pods = math.floor(player_count / 8 + 0.5)

    sizes = [8] * num_pods
    remainder = player_count % 8

    lookup_table = {
        0: (0, 0),
        1: (1, 0),
        2: (2, 0),
        3: (1, 2),
        4: (-2, -2),
        5: (-1, -2),
        6: (-2, 0),
        7: (-1, 0),
    }

    mod1, mod2 = lookup_table.get(remainder, (0, 0))
    sizes[0] += mod1
    if num_pods > 1:
        sizes[1] += mod2

    # Safety net: with the round-half-up num_pods the lookup is sum-preserving
    # for num_pods >= 2; this only corrects degenerate single-pod edges so the
    # seats are guaranteed to sum to player_count (never silently INFEASIBLE).
    diff = player_count - sum(sizes)
    i = 0
    while diff != 0:
        step = 1 if diff > 0 else -1
        sizes[i % num_pods] += step
        diff -= step
        i += 1

    # Largest pod first. The optimizer slices players sorted by standing
    # (best first) into pods IN THIS ORDER, so pod 0 receives the top-standing
    # players. Returning the sizes ascending would put the round-1 winners into
    # the smallest, incomplete pod; the best standings must always get a full
    # 8-player pod, and the leftover (smaller) pod goes to the lowest standings.
    sizes.sort(reverse=True)

    return sizes
