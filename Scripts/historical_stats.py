#!/usr/bin/env python

"""historical_stats.py: Career and per-session stats from all eggball NDJSONs.

Reads all .ndjson files from the All Games folder, groups them by session date,
and outputs:
  1. Career totals (with Per Game row)
  2. Sessions in reverse chronological order (most recent first)

Usage:
    python historical_stats.py "<ALL_GAMES_DIR>"
"""

import csv
import ndjson
import os
import sys
import tabulate as tabulate_mod
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

from box_score import BoxScore, build_table, build_per_game_table, DISPLAY_HEADERS, OUTPUT_DIR


def extract_date(filename):
    """Return YYYY-MM-DD from a tagpro recording filename.

    Handles two timestamp formats:
      - Unix ms (13 digits):  1713317955186  → divide by 1000 → Unix seconds
      - Date string (14 digits): 20230117205645 → parse as YYYYMMDDHHMMSS
    """
    stem = Path(filename).stem
    parts = stem.split('-')
    try:
        ts = int(parts[-1])
        if len(str(ts)) >= 14:
            # YYYYMMDDHHMMSS format used by older recordings
            s = str(ts)
            return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%d')
    except (ValueError, IndexError):
        return 'unknown'


def main():
    if len(sys.argv) != 2:
        print("Usage: python historical_stats.py <all_games_dir>")
        sys.exit(1)

    input_dir = Path(sys.argv[1])
    bs = BoxScore.__new__(BoxScore)

    # Group NDJSONs by session date
    games_by_date = defaultdict(list)
    for filename in os.listdir(input_dir):
        if filename.endswith('.ndjson'):
            games_by_date[extract_date(filename)].append(filename)

    if not games_by_date:
        print("No .ndjson files found in", input_dir)
        sys.exit(1)

    all_records = []
    sessions = []  # (date, n_games, day_final) in chronological order

    for date in sorted(games_by_date.keys()):
        day_records = []
        for filename in sorted(games_by_date[date]):
            path = input_dir / filename
            with open(path) as f:
                try:
                    data = ndjson.load(f)
                    results = bs.one_game(data)
                    day_records.extend(results)
                    all_records.extend(results)
                except (ValueError, KeyError):
                    continue

        if not day_records:
            continue

        day_final = bs.merge_results(day_records)
        sessions.append((date, len(games_by_date[date]), day_final))

    sections = []
    csv_rows = []
    total_games = sum(n for _, n, _ in sessions)

    # --- 1. Career totals ---
    career_final = bs.merge_results(all_records)
    career_table = build_table(career_final)

    sections.append(f"{'=' * 60}")
    sections.append(f"  CAREER TOTALS  ({len(sessions)} sessions, {total_games} games)")
    sections.append(f"{'=' * 60}\n")
    sections.append(tabulate_mod.tabulate(career_table, DISPLAY_HEADERS))

    csv_rows.append([f"CAREER TOTALS ({len(sessions)} sessions, {total_games} games)"])
    csv_rows.append(DISPLAY_HEADERS)
    csv_rows.extend(career_table)

    # --- 2. Career per game ---
    pg_table = build_per_game_table(career_final, total_games)

    sections.append(f"\n\n{'=' * 60}")
    sections.append(f"  CAREER PER GAME  ({total_games} games)")
    sections.append(f"{'=' * 60}\n")
    sections.append(tabulate_mod.tabulate(pg_table, DISPLAY_HEADERS))

    csv_rows.append([])
    csv_rows.append([f"CAREER PER GAME ({total_games} games)"])
    csv_rows.append(DISPLAY_HEADERS)
    csv_rows.extend(pg_table)

    # --- 3. Sessions, most recent first ---
    for date, n_games, day_final in reversed(sessions):
        table = build_table(day_final)

        sections.append(f"\n\n{'=' * 60}")
        sections.append(f"  Session: {date}  ({n_games} game{'s' if n_games != 1 else ''})")
        sections.append(f"{'=' * 60}\n")
        sections.append(tabulate_mod.tabulate(table, DISPLAY_HEADERS))

        csv_rows.append([])
        csv_rows.append([f"Session: {date} ({n_games} game{'s' if n_games != 1 else ''})"])
        csv_rows.append(DISPLAY_HEADERS)
        csv_rows.extend(table)

    timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    # Write TXT
    output_path = OUTPUT_DIR / f'historical_stats_{timestamp}.txt'
    with open(output_path, 'w') as f:
        f.write('\n'.join(sections))
    print(f"Written to {output_path}")

    # Write CSV
    csv_path = OUTPUT_DIR / f'historical_stats_{timestamp}.csv'
    with open(csv_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(csv_rows)
    print(f"Written to {csv_path}")


if __name__ == '__main__':
    main()
