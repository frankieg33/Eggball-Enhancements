#!/usr/bin/env python

"""box_score_teams.py: Same as box_score.py but splits output by in-game team.

Teams are auto-detected from the NDJSON data — no player list needed.
Best used on a single game day where teams stayed consistent.
Rows are sorted by Bad% ascending (best player first).

Usage:
    python box_score_teams.py "<NDJSON_DIR>"

Example:
    python box_score_teams.py "NDJSONs/2024-04-17/"
"""

import sys
import tabulate
from pathlib import Path

from box_score import BoxScore, build_table, totals_row, DISPLAY_HEADERS


class BoxScoreTeams(BoxScore):
    def print_box_score(self, final):
        team1 = {name: p for name, p in final.items() if p['team'] == 1}
        team2 = {name: p for name, p in final.items() if p['team'] == 2}

        table1 = build_table(team1)
        table2 = build_table(team2)

        path = Path(self.dir) / 'box_score_teams.txt'
        with open(path, 'w') as f:
            f.write("--- Team 1 ---\n")
            f.write(tabulate.tabulate(table1, DISPLAY_HEADERS))
            f.write("\n\n--- Team 2 ---\n")
            f.write(tabulate.tabulate(table2, DISPLAY_HEADERS))
        print(f"Written to {path}")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python box_score_teams.py <ndjson_dir>")
        sys.exit(1)
    BoxScoreTeams(sys.argv[1])
