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
import json
import ndjson
import os
import sys
import tabulate as tabulate_mod
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict

from box_score import BoxScore, build_table, build_per_game_table, DISPLAY_HEADERS, OUTPUT_DIR, write_formatted_xlsx


def extract_date_from_filename(filename):
    """Return YYYY-MM-DD from legacy tagpro recording filenames.

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


def extract_date_from_ndjson(path):
    """Return YYYY-MM-DD from recorder metadata for newer opaque filenames."""
    try:
        with open(path, encoding='utf-8') as f:
            first_line = f.readline().strip()
    except OSError:
        return 'unknown'

    if not first_line:
        return 'unknown'

    try:
        record = json.loads(first_line)
    except json.JSONDecodeError:
        return 'unknown'

    if not (isinstance(record, list) and len(record) >= 3 and record[1] == 'recorder-metadata'):
        return 'unknown'

    started = record[2].get('started')
    if not isinstance(started, (int, float)):
        return 'unknown'

    return datetime.fromtimestamp(started / 1000).strftime('%Y-%m-%d')


def extract_date(path):
    """Return YYYY-MM-DD for both legacy and current TagPro recording formats."""
    filename_date = extract_date_from_filename(path.name)
    if filename_date != 'unknown':
        return filename_date
    return extract_date_from_ndjson(path)


def infer_game_format(data):
    """Return '5v5', '6v6', or 'other' based on roster size."""
    if data:
        first = data[0]
        if (
            isinstance(first, list)
            and len(first) >= 3
            and first[1] == 'recorder-metadata'
            and isinstance(first[2], dict)
        ):
            players = first[2].get('players')
            if isinstance(players, list):
                team_counts = defaultdict(int)
                for player in players:
                    team = player.get('team')
                    if team in (1, 2):
                        team_counts[team] += 1
                if team_counts[1] == 5 and team_counts[2] == 5:
                    return '5v5'
                if team_counts[1] == 6 and team_counts[2] == 6:
                    return '6v6'

    for line in data:
        if line[1] == 'p' and isinstance(line[2], list) and line[2] and 'name' in line[2][0]:
            team_counts = defaultdict(int)
            for player in line[2]:
                team = player.get('team')
                if team in (1, 2):
                    team_counts[team] += 1
            if team_counts[1] == 5 and team_counts[2] == 5:
                return '5v5'
            if team_counts[1] == 6 and team_counts[2] == 6:
                return '6v6'
            break

    return 'other'


def append_table_section(sections, csv_rows, title, subtitle, final, n_games, per_game=False):
    if not final or n_games <= 0:
        return

    table = build_per_game_table(final, n_games) if per_game else build_table(final)
    if not table:
        return

    sections.append(f"\n\n{'=' * 60}")
    sections.append(f"  {title}  ({subtitle})")
    sections.append(f"{'=' * 60}\n")
    sections.append(tabulate_mod.tabulate(table, DISPLAY_HEADERS))

    csv_rows.append([])
    csv_rows.append([f"{title} ({subtitle})"])
    csv_rows.append(DISPLAY_HEADERS)
    csv_rows.extend(table)


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
            path = input_dir / filename
            games_by_date[extract_date(path)].append(filename)

    if not games_by_date:
        print("No .ndjson files found in", input_dir)
        sys.exit(1)

    all_records = []
    records_by_format = defaultdict(list)
    games_by_format = defaultdict(int)
    sessions = []  # (date, n_games, day_final) in chronological order

    for date in sorted(games_by_date.keys()):
        day_records = []
        day_format_counts = defaultdict(int)
        for filename in sorted(games_by_date[date]):
            path = input_dir / filename
            with open(path) as f:
                try:
                    data = ndjson.load(f)
                    results = bs.one_game(data)
                    game_format = infer_game_format(data)
                    day_records.extend(results)
                    all_records.extend(results)
                    records_by_format[game_format].extend(results)
                    games_by_format[game_format] += 1
                    day_format_counts[game_format] += 1
                except (ValueError, KeyError):
                    continue

        if not day_records:
            continue

        day_final = bs.merge_results(day_records)
        sessions.append((date, len(games_by_date[date]), day_final, dict(day_format_counts)))

    sections = []
    csv_rows = []
    total_games = sum(n for _, n, _, _ in sessions)

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

    append_table_section(
        sections,
        csv_rows,
        'CAREER TOTALS 6V6',
        f"{games_by_format['6v6']} games",
        bs.merge_results(records_by_format['6v6']),
        games_by_format['6v6'],
    )
    append_table_section(
        sections,
        csv_rows,
        'CAREER PER GAME 6V6',
        f"{games_by_format['6v6']} games",
        bs.merge_results(records_by_format['6v6']),
        games_by_format['6v6'],
        per_game=True,
    )
    append_table_section(
        sections,
        csv_rows,
        'CAREER TOTALS 5V5',
        f"{games_by_format['5v5']} games",
        bs.merge_results(records_by_format['5v5']),
        games_by_format['5v5'],
    )
    append_table_section(
        sections,
        csv_rows,
        'CAREER PER GAME 5V5',
        f"{games_by_format['5v5']} games",
        bs.merge_results(records_by_format['5v5']),
        games_by_format['5v5'],
        per_game=True,
    )

    # --- 3. Sessions, most recent first ---
    for date, n_games, day_final, day_format_counts in reversed(sessions):
        table = build_table(day_final)
        format_parts = []
        if day_format_counts.get('5v5'):
            format_parts.append(f"5v5: {day_format_counts['5v5']}")
        if day_format_counts.get('6v6'):
            format_parts.append(f"6v6: {day_format_counts['6v6']}")
        if day_format_counts.get('other'):
            format_parts.append(f"other: {day_format_counts['other']}")
        format_suffix = f"; {', '.join(format_parts)}" if format_parts else ""

        sections.append(f"\n\n{'=' * 60}")
        sections.append(f"  Session: {date}  ({n_games} game{'s' if n_games != 1 else ''}{format_suffix})")
        sections.append(f"{'=' * 60}\n")
        sections.append(tabulate_mod.tabulate(table, DISPLAY_HEADERS))

        csv_rows.append([])
        csv_rows.append([f"Session: {date} ({n_games} game{'s' if n_games != 1 else ''}{format_suffix})"])
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

    xlsx_path = OUTPUT_DIR / f'historical_stats_{timestamp}.xlsx'
    write_formatted_xlsx(xlsx_path, csv_rows)
    print(f"Written to {xlsx_path}")


if __name__ == '__main__':
    main()
