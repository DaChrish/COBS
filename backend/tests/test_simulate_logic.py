"""Tests for pure simulation logic functions."""

from cobs.logic.simulate import generate_match_results, generate_photo_image


def test_returns_result_for_each_match():
    ids = ["m1", "m2", "m3"]
    results = generate_match_results(ids, seed=1, with_conflicts=False)
    assert len(results) == len(ids)
    assert {r["match_id"] for r in results} == set(ids)


def test_results_have_valid_scores():
    ids = [f"m{i}" for i in range(50)]
    results = generate_match_results(ids, seed=7, with_conflicts=False)
    for r in results:
        assert max(r["p1_wins"], r["p2_wins"]) == 2
        assert r["p1_wins"] + r["p2_wins"] in (2, 3)


def test_no_conflicts_when_disabled():
    ids = [f"m{i}" for i in range(50)]
    results = generate_match_results(ids, seed=42, with_conflicts=False)
    assert all(r["has_conflict"] is False for r in results)


def test_some_conflicts_when_enabled():
    ids = [f"m{i}" for i in range(50)]
    results = generate_match_results(ids, seed=42, with_conflicts=True)
    conflict_count = sum(1 for r in results if r["has_conflict"])
    assert conflict_count > 0
    assert conflict_count < len(ids)


def test_conflict_results_disagree():
    ids = [f"m{i}" for i in range(50)]
    results = generate_match_results(ids, seed=42, with_conflicts=True)
    for r in results:
        if r["has_conflict"]:
            assert r["p1_report"] != r["p2_report"]


def test_seed_reproducibility():
    ids = ["a", "b", "c"]
    r1 = generate_match_results(ids, seed=99, with_conflicts=True)
    r2 = generate_match_results(ids, seed=99, with_conflicts=True)
    assert r1 == r2


def test_returns_jpeg_bytes():
    data = generate_photo_image("alice", "POOL", 1)
    assert data[:2] == b"\xff\xd8"


def test_different_types_produce_different_images():
    pool = generate_photo_image("alice", "POOL", 1)
    deck = generate_photo_image("alice", "DECK", 1)
    assert pool != deck
