def calculate_pod_sizes(player_count: int) -> list[int]:
    """Calculate pod sizes from player count. Port of TypeScript calculatePodSizes."""
    num_pods = round(player_count / 8)
    if num_pods <= 0:
        return [player_count]

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

    return sizes
