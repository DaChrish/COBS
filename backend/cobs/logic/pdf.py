from fpdf import FPDF


def _latin1_safe(text: str) -> str:
    """Replace Unicode characters not supported by built-in PDF fonts."""
    return text.replace("\u2014", "-").replace("\u2013", "-").replace("\u00b7", "-")


def generate_standings_pdf(
    tournament_name: str, round_label: str, standings: list[dict]
) -> bytes:
    pdf = FPDF()
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1_safe(f"COBS - {tournament_name}"), new_x="LMARGIN", new_y="NEXT")

    # Subtitle
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _latin1_safe(f"Standings nach {round_label}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Table header
    col_widths = [12, 55, 18, 22, 20, 20, 20]
    headers = ["#", "Spieler", "Pkt", "W-L-D", "OMW%", "GW%", "OGW%"]

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(230, 230, 230)
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 7, header, border=1, fill=True)
    pdf.ln()

    # Table rows
    pdf.set_font("Helvetica", "", 9)
    for row in standings:
        if row["dropped"]:
            pdf.set_text_color(150, 150, 150)
            name = f"{row['username']} (D)"
        else:
            pdf.set_text_color(0, 0, 0)
            name = row["username"]

        values = [
            str(row["rank"]),
            name,
            str(row["match_points"]),
            row["record"],
            row["omw"],
            row["gw"],
            row["ogw"],
        ]
        for i, val in enumerate(values):
            pdf.cell(col_widths[i], 7, val, border=1)
        pdf.ln()

    pdf.set_text_color(0, 0, 0)
    return bytes(pdf.output())


def generate_pairings_pdf(
    tournament_name: str, round_label: str, pods: list[dict]
) -> bytes:
    pdf = FPDF()
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1_safe(f"COBS - {tournament_name}"), new_x="LMARGIN", new_y="NEXT")

    # Subtitle
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _latin1_safe(round_label), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    col_widths = [20, 60, 10, 60]

    for pod in pods:
        # Pod section header
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, _latin1_safe(pod["pod_name"]), new_x="LMARGIN", new_y="NEXT")

        # Table header
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        for i, header in enumerate(["Tisch", "Spieler 1", "vs", "Spieler 2"]):
            pdf.cell(col_widths[i], 7, header, border=1, fill=True)
        pdf.ln()

        # Matches
        pdf.set_font("Helvetica", "", 9)
        for match in pod["matches"]:
            values = [str(match["table"]), match["player1"], "vs", match["player2"]]
            for i, val in enumerate(values):
                pdf.cell(col_widths[i], 7, val, border=1)
            pdf.ln()

        # Byes
        for player in pod.get("byes", []):
            pdf.cell(col_widths[0], 7, "BYE", border=1)
            pdf.cell(sum(col_widths[1:]), 7, player, border=1)
            pdf.ln()

        pdf.ln(4)

    return bytes(pdf.output())


def generate_results_pdf(
    tournament_name: str, round_label: str, pods: list[dict]
) -> bytes:
    """Generate a match results PDF.

    pods: list of dicts with keys:
        pod_name, matches (list of {table, player1, result, player2, status}), byes (list of player names)
    """
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1_safe(f"COBS - {tournament_name}"), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _latin1_safe(round_label), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    col_widths = [15, 55, 20, 55, 20]

    for pod in pods:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, _latin1_safe(pod["pod_name"]), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        for w, h in zip(col_widths, ["T", "Spieler 1", "Ergebnis", "Spieler 2", "Status"]):
            pdf.cell(w, 7, h, border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for m in pod["matches"]:
            pdf.cell(col_widths[0], 7, str(m.get("table", "")), border=1)
            pdf.cell(col_widths[1], 7, _latin1_safe(m["player1"]), border=1)
            pdf.cell(col_widths[2], 7, m.get("result", "-"), border=1, align="C")
            pdf.cell(col_widths[3], 7, _latin1_safe(m.get("player2", "-")), border=1)
            pdf.cell(col_widths[4], 7, m.get("status", ""), border=1, align="C")
            pdf.ln()

        for player in pod.get("byes", []):
            pdf.cell(col_widths[0], 7, "", border=1)
            pdf.cell(col_widths[1], 7, _latin1_safe(player), border=1)
            pdf.cell(col_widths[2], 7, "BYE", border=1, align="C")
            pdf.cell(col_widths[3], 7, "-", border=1)
            pdf.cell(col_widths[4], 7, "3 Pkt", border=1, align="C")
            pdf.ln()

        pdf.ln(4)

    return bytes(pdf.output())


def generate_pods_pdf(
    tournament_name: str, round_label: str, pods: list[dict]
) -> bytes:
    """Generate a pods overview PDF.

    pods: list of dicts with keys:
        table, pod_name, players (list of {seat, username})
    """
    pdf = FPDF()
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1_safe(f"COBS - {tournament_name}"), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _latin1_safe(round_label), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    col_widths = [15, 55]

    for pod in pods:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, _latin1_safe(f"Pod {pod['table']} - {pod['pod_name']}"), new_x="LMARGIN", new_y="NEXT")

        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 230)
        pdf.cell(col_widths[0], 7, "Seat", border=1, fill=True)
        pdf.cell(col_widths[1], 7, "Spieler", border=1, fill=True)
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for player in pod["players"]:
            pdf.cell(col_widths[0], 7, str(player["seat"]), border=1)
            pdf.cell(col_widths[1], 7, player["username"], border=1)
            pdf.ln()

        pdf.ln(4)

    return bytes(pdf.output())
