from cobs.logic.pod_sizes import calculate_pod_sizes


def test_8_players():
    assert calculate_pod_sizes(8) == [8]


def test_16_players():
    assert calculate_pod_sizes(16) == [8, 8]


def test_24_players():
    assert calculate_pod_sizes(24) == [8, 8, 8]


def test_9_players():
    assert calculate_pod_sizes(9) == [9]


def test_10_players():
    assert calculate_pod_sizes(10) == [10]


def test_12_players():
    assert calculate_pod_sizes(12) == [6, 6]


def test_15_players():
    assert calculate_pod_sizes(15) == [7, 8]


def test_17_players():
    assert calculate_pod_sizes(17) == [9, 8]


def test_2_players():
    assert calculate_pod_sizes(2) == [2]


def test_1_player():
    assert calculate_pod_sizes(1) == [1]
