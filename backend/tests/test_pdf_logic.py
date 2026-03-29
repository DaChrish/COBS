import pytest
from cobs.logic.pdf import generate_standings_pdf, generate_pairings_pdf, generate_pods_pdf


class TestStandingsPdf:
    def test_returns_pdf_bytes(self):
        standings = [
            {"rank": 1, "username": "Alice", "match_points": 9, "record": "3-0-0",
             "omw": "66.67%", "gw": "77.78%", "ogw": "55.56%", "dropped": False},
            {"rank": 2, "username": "Bob", "match_points": 6, "record": "2-1-0",
             "omw": "55.56%", "gw": "66.67%", "ogw": "48.15%", "dropped": False},
        ]
        result = generate_standings_pdf("Test Tournament", "Runde 2", standings)
        assert isinstance(result, bytes)
        assert result[:4] == b"%PDF"

    def test_handles_dropped_players(self):
        standings = [
            {"rank": 1, "username": "Alice", "match_points": 9, "record": "3-0-0",
             "omw": "66.67%", "gw": "77.78%", "ogw": "55.56%", "dropped": False},
            {"rank": 2, "username": "Dropped", "match_points": 0, "record": "0-1-0",
             "omw": "33.00%", "gw": "33.00%", "ogw": "33.00%", "dropped": True},
        ]
        result = generate_standings_pdf("Test", "Runde 1", standings)
        assert result[:4] == b"%PDF"

    def test_empty_standings(self):
        result = generate_standings_pdf("Test", "Runde 1", [])
        assert result[:4] == b"%PDF"


class TestPairingsPdf:
    def test_returns_pdf_bytes(self):
        pods = [{"pod_name": "Pod 1 \u00b7 Test Cube", "matches": [
            {"table": 1, "player1": "Alice", "player2": "Bob"},
            {"table": 2, "player1": "Charlie", "player2": "Diana"},
        ], "byes": []}]
        result = generate_pairings_pdf("Test Tournament", "Runde 1 \u2014 Swiss 2", pods)
        assert isinstance(result, bytes)
        assert result[:4] == b"%PDF"

    def test_handles_byes(self):
        pods = [{"pod_name": "Pod 1 \u00b7 Test Cube", "matches": [
            {"table": 1, "player1": "Alice", "player2": "Bob"},
        ], "byes": ["Charlie"]}]
        result = generate_pairings_pdf("Test", "Runde 1 \u2014 Swiss 1", pods)
        assert result[:4] == b"%PDF"


class TestPodsPdf:
    def test_returns_pdf_bytes(self):
        pods = [{"table": 1, "pod_name": "Test Cube", "players": [
            {"seat": 1, "username": "Alice"},
            {"seat": 2, "username": "Bob"},
        ]}]
        result = generate_pods_pdf("Test", "Runde 1 - Pods", pods)
        assert isinstance(result, bytes)
        assert result[:4] == b"%PDF"
