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

import csv
import os
import sys
import tabulate
from datetime import datetime
from pathlib import Path

import ndjson

from box_score import BoxScore, build_table, DISPLAY_HEADERS, OUTPUT_DIR, write_formatted_xlsx


class BoxScoreTeams(BoxScore):
    def produce_stats(self):
        records = []
        for filename in os.listdir(self.dir):
            if not filename.endswith('.ndjson'):
                continue
            path = Path(self.dir) / filename
            with open(path) as f:
                try:
                    data = ndjson.load(f)
                    records.extend(self.one_game(data))
                except ValueError:
                    continue
        final = self.merge_results(records)
        self.print_box_score(final)

    def print_box_score(self, final):
        team1 = {name: p for name, p in final.items() if p['team'] == 1}
        team2 = {name: p for name, p in final.items() if p['team'] == 2}

        table1 = build_table(team1)
        table2 = build_table(team2)
        csv_rows = [
            ['TEAM 1'],
            DISPLAY_HEADERS,
            *table1,
            [],
            ['TEAM 2'],
            DISPLAY_HEADERS,
            *table2,
        ]

        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        OUTPUT_DIR.mkdir(exist_ok=True)
        
        # Write TXT
        path = OUTPUT_DIR / f'box_score_teams_{timestamp}.txt'
        with open(path, 'w') as f:
            f.write("--- Team 1 ---\n")
            f.write(tabulate.tabulate(table1, DISPLAY_HEADERS))
            f.write("\n\n--- Team 2 ---\n")
            f.write(tabulate.tabulate(table2, DISPLAY_HEADERS))
        print(f"Written to {path}")

        # Write CSV
        csv_path = OUTPUT_DIR / f'box_score_teams_{timestamp}.csv'
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(csv_rows)
        print(f"Written to {csv_path}")

        xlsx_path = OUTPUT_DIR / f'box_score_teams_{timestamp}.xlsx'
        write_formatted_xlsx(xlsx_path, csv_rows)
        print(f"Written to {xlsx_path}")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python box_score_teams.py <ndjson_dir>")
        sys.exit(1)
    BoxScoreTeams(sys.argv[1])
