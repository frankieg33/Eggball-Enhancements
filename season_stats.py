#!/usr/bin/env python

"""season_stats.py: Career and per-game-day stats from all eggball NDJSONs.

Expects a folder of dated subfolders, one per game day:
    NDJSONs/
        2024-04-17/
            tagpro-recording-xxx.ndjson
            tagpro-recording-yyy.ndjson
        2024-05-01/
            ...

All players are auto-detected. No player list needed.
Each game day gets its own box score. Career totals appear at the end.
Output is written to season_stats.txt in the top-level NDJSONs folder.

Usage:
    python season_stats.py "<NDJSON_DIR>"

Example:
    python season_stats.py "NDJSONs/"
"""

import ndjson
import os
import sys
import tabulate as tabulate_mod
from pathlib import Path

from box_score import BoxScore, build_table, DISPLAY_HEADERS, RAW_KEYS


def parse_day(bs, day_dir):
    """Parse all NDJSONs in a single game-day subfolder, return merged results."""
    records = []
    for filename in sorted(os.listdir(day_dir)):
        if not filename.endswith('.ndjson'):
            continue
        path = Path(day_dir) / filename
        with open(path) as f:
            try:
                data = ndjson.load(f)
                results = bs.one_game(data)
                records.extend(results)
            except (ValueError, KeyError):
                continue
    return bs.merge_results(records)


def main():
    if len(sys.argv) != 2:
        print("Usage: python season_stats.py <ndjson_dir>")
        sys.exit(1)

    input_dir = Path(sys.argv[1])

    # Create a BoxScore instance without triggering file I/O
    bs = BoxScore.__new__(BoxScore)

    # Find all dated subfolders (any directory inside input_dir)
    day_dirs = sorted([
        d for d in input_dir.iterdir()
        if d.is_dir()
    ])

    if not day_dirs:
        print("No subfolders found. Expected dated subfolders like NDJSONs/2024-04-17/")
        sys.exit(1)

    all_records = []
    sections = []

    for day_path in day_dirs:
        day_final = parse_day(bs, day_path)
        if not day_final:
            continue

        # Collect raw records for career totals
        for name, p in day_final.items():
            rec = dict(p)
            rec['player'] = name
            all_records.append(rec)

        table = build_table(day_final)
        ndjson_count = sum(1 for f in os.listdir(day_path) if f.endswith('.ndjson'))

        sections.append(f"\n{'=' * 60}")
        sections.append(f"  Game Day: {day_path.name}  ({ndjson_count} games)")
        sections.append(f"{'=' * 60}\n")
        sections.append(tabulate_mod.tabulate(table, DISPLAY_HEADERS))

    # Career totals — re-merge all day-level results by player
    career_final = bs.merge_results(all_records)
    career_table = build_table(career_final)

    sections.append(f"\n\n{'=' * 60}")
    sections.append(f"  CAREER TOTALS  ({len(day_dirs)} game days)")
    sections.append(f"{'=' * 60}\n")
    sections.append(tabulate_mod.tabulate(career_table, DISPLAY_HEADERS))

    output_path = input_dir / 'season_stats.txt'
    with open(output_path, 'w') as f:
        f.write('\n'.join(sections))
    print(f"Written to {output_path}")


if __name__ == '__main__':
    main()
