import pytest
from cobs.logic.pdf import (
    _latin1_safe,
    generate_pairings_pdf,
    generate_pods_pdf,
    generate_results_pdf,
    generate_standings_pdf,
)

# The live Braunschweig 2 export 500'd on this real cube name (U+2606 star).
STAR_CUBE = "☆ CCC - Casual Champions Cube (est.2013) ☆"
# Other characters outside latin-1 that must not crash the export.
WEIRD_NAME = "Jan★ \U0001f600 中文"


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


class TestUnicodeSafety:
    """Built-in fpdf fonts only support latin-1. Any character outside that
    range (☆, emoji, CJK) must be sanitized so the export never 500s."""

    def test_latin1_safe_output_is_always_encodable(self):
        for s in [STAR_CUBE, WEIRD_NAME, "normal", "Müller", "em—dash"]:
            _latin1_safe(s).encode("latin-1")  # must not raise

    def test_pods_pdf_with_star_cube_name(self):
        # Exact reproduction of the live crash.
        pods = [{"table": 6, "pod_name": STAR_CUBE, "players": [
            {"seat": 1, "username": WEIRD_NAME},
            {"seat": 2, "username": "Bob"},
        ]}]
        result = generate_pods_pdf("Test", "Runde 3 - Pods", pods)
        assert result[:4] == b"%PDF"

    def test_standings_pdf_with_unicode_username(self):
        standings = [{"rank": 1, "username": WEIRD_NAME, "match_points": 9,
                      "record": "3-0-0", "omw": "66.67%", "gw": "77.78%",
                      "ogw": "55.56%", "dropped": False}]
        assert generate_standings_pdf(STAR_CUBE, "Runde 1", standings)[:4] == b"%PDF"

    def test_pairings_pdf_with_unicode_names(self):
        pods = [{"pod_name": STAR_CUBE, "matches": [
            {"table": 1, "player1": WEIRD_NAME, "player2": "Bob"},
        ], "byes": [WEIRD_NAME]}]
        assert generate_pairings_pdf("Test", "Runde 1", pods)[:4] == b"%PDF"

    def test_results_pdf_with_unicode_names(self):
        pods = [{"pod_name": STAR_CUBE, "matches": [
            {"table": 1, "player1": WEIRD_NAME, "result": "2-0", "player2": "Bob", "status": "OK"},
        ], "byes": [WEIRD_NAME]}]
        assert generate_results_pdf("Test", "Runde 1", pods)[:4] == b"%PDF"
