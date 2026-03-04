#!/usr/bin/env python

"""box_score.py: Parse eggball NDJSON records and print a single box score table.

All players are auto-detected from the NDJSON files — no player list needed.
Rows are sorted by Bad% ascending (best player first).

Usage:
    python box_score.py "<NDJSON_DIR>"

Example:
    python box_score.py "NDJSONs/2024-04-17/"
"""

import csv
import ndjson
import os
import sys
import tabulate
from datetime import datetime
from pathlib import Path

OUTPUT_DIR = Path(__file__).parent.parent / 'Box Scores'

# Players to exclude from all output. Add names (lowercase) to hide them.
EXCLUDE_PLAYERS = {
    # 'blaster',
}

DISPLAY_HEADERS = [
    'Player', 'Hold (secs)', 'Egg Start', 'Receptions', 'Ints Caught', 'Tags',
    'Total Touches', 'Time Held PP', 'Self Passes', 'Touches w/ SP',
    'Completions', 'Caps', 'Raps Thrown', 'Raps Caught',
    'Good', 'Good %', 'Ints Thrown', 'Tagged', 'Bad', 'Bad %'
]
# Indices averaged (not summed) in the totals row
_AVG_FLOAT_IDX = {7}    # Hold Time
_AVG_PCT_IDX   = {15, 19}  # Good %, Bad %

RAW_KEYS = [
    'hold', 'start_egg', 'receptions', 'self_passes', 'ints_caught', 'tags',
    'caps', 'raps_thrown', 'completions', 'ints_thrown', 'tagged', 'raps_caught'
]


def player_row(name, p):
    touches = p['start_egg'] + p['receptions'] + p['ints_caught'] + p['tags']
    hold_time = round(p['hold'] / touches, 2) if touches else 0.0
    touches_wsp = touches + p['self_passes']
    good = p['completions'] + p['caps'] + p['raps_thrown'] + p['raps_caught']
    good_pct = f"{good / touches * 100:.1f}%" if touches else "0.0%"
    bad = p['ints_thrown'] + p['tagged']
    bad_pct = f"{bad / touches * 100:.1f}%" if touches else "0.0%"
    return [
        name, round(p['hold'], 1),
        p['start_egg'], p['receptions'], p['ints_caught'], p['tags'],
        touches, hold_time, p['self_passes'], touches_wsp,
        p['completions'], p['caps'], p['raps_thrown'], p['raps_caught'],
        good, good_pct,
        p['ints_thrown'], p['tagged'], bad, bad_pct
    ]


def totals_row(rows):
    n = len(rows)
    result = ['Total']
    for i in range(1, len(DISPLAY_HEADERS)):
        col_vals = [r[i] for r in rows]
        if i in _AVG_FLOAT_IDX:
            result.append(round(sum(col_vals) / n, 2))
        elif i in _AVG_PCT_IDX:
            nums = [float(v.rstrip('%')) for v in col_vals]
            result.append(f"{sum(nums) / n:.1f}%")
        else:
            result.append(sum(col_vals))
    return result


def _should_exclude(name):
    lower = name.lower()
    return lower in EXCLUDE_PLAYERS or lower.startswith('some ball')


def build_table(final):
    """Return sorted player rows + totals row for all players in final."""
    rows = [player_row(name, p) for name, p in final.items()
            if not _should_exclude(name)]
    rows.sort(key=lambda r: float(r[19].rstrip('%')))
    if rows:
        rows.append(totals_row(rows))
    return rows


def build_per_game_table(final, n_games):
    """Return a per-game stats table: each player's raw stats divided by n_games.
    Percentages and Hold Time are rates and stay unchanged."""
    keep_same = _AVG_FLOAT_IDX | _AVG_PCT_IDX  # indices 7, 15, 19

    def pg_player_row(name, p):
        base = player_row(name, p)
        row = [name]
        for i in range(1, len(DISPLAY_HEADERS)):
            val = base[i]
            if i in keep_same:
                row.append(val)
            else:
                row.append(round(val / n_games, 1))
        return row

    rows = [pg_player_row(name, p) for name, p in final.items()
            if not _should_exclude(name)]
    rows.sort(key=lambda r: float(r[19].rstrip('%')))
    return rows


class BoxScore:
    def __init__(self, input_dir, auto_produce=True):
        self.dir = input_dir
        if auto_produce:
            self.produce_stats()

    def produce_stats(self):
        records = []
        for filename in os.listdir(self.dir):
            if not filename.endswith('.ndjson'):
                continue
            path = Path(self.dir) / filename
            with open(path) as f:
                try:
                    data = ndjson.load(f)
                    results = self.one_game(data)
                    for r in results:
                        records.append(r)
                except ValueError:
                    continue
        final = self.merge_results(records)
        self.print_box_score(final)

    def one_game(self, data):
        ids = self.initialize_game(data)
        eggball = [x for x in data if x[1] == 'eggBall' or x[1] == 'boat']
        eggball = [x for x in eggball if x[1] == 'boat' or x[2]['state']]
        eggball = eggball[1:]
        huddleSwitch = False
        prevHolder = {}
        prevPrevHolder = {}
        holder = {}
        caughtAt = 0
        in_air = True
        waiting_last = False
        for i in eggball:
            timestamp = i[0]
            dic = i[2]
            if i[1] == 'boat':
                if prevPrevHolder.get('team') == prevHolder.get('team'):
                    prevPrevHolder['raps_thrown'] += 1
                    prevPrevHolder['caps'] += 1
                    prevHolder['raps_caught'] += 1
                else:
                    prevHolder['raps_caught'] += 1
                waiting_last = False
                continue
            if dic['state'] == 'waiting':
                if waiting_last:
                    continue
                try:
                    prevHolder['caps'] += 1
                    prevHolder['hold'] += ((timestamp - caughtAt) / 1000)
                except KeyError:
                    # sys.stderr.write('No prevHolder ' + str(timestamp))
                    pass
                waiting_last = True
                continue
            waiting_last = False
            holderid = dic['holder']
            if holderid:
                holder = ids[holderid]
            if dic['state'] == 'huddle':
                if huddleSwitch:
                    holder['start_egg'] += 1
                    prevHolder = ids[holderid]
                    caughtAt = timestamp + 5000
                huddleSwitch = not huddleSwitch
            elif not in_air:
                if holderid and holderid != prevHolder.get('id'):
                    if holder['team'] == prevHolder.get('team'):
                        holder['receptions'] += 1
                        prevHolder['completions'] += 1
                    else:
                        holder['tags'] += 1
                        prevHolder['tagged'] += 1
                prevHolder['hold'] += ((timestamp - caughtAt) / 1000)
                caughtAt = timestamp
            elif holderid:
                if holder['team'] != prevHolder.get('team'):
                    prevHolder['ints_thrown'] += 1
                    holder['ints_caught'] += 1
                elif holder != prevHolder:
                    prevHolder['completions'] += 1
                    holder['receptions'] += 1
                else:
                    holder['self_passes'] += 1
                caughtAt = timestamp
            else:
                prevHolder['hold'] += ((timestamp - caughtAt) / 1000)
            if holderid:
                prevPrevHolder = prevHolder
                prevHolder = ids[holderid]
                in_air = False
            else:
                in_air = True
        return ids[1:]

    def initialize_game(self, data):
        ids = [None] * 50
        ids[0] = {'player': 'Brazzers', 'team': 0}
        start_time = 0
        end_time = -1
        for line in data:
            if line[1] == 'p' and type(line[2]) is list and 'name' in line[2][0]:
                for player in line[2]:
                    id = player['id']
                    ids[id] = {
                        'id': id,
                        'player': player['name'],
                        'team': player['team'],
                        'hold': 0.0,
                        'start_egg': 0,
                        'receptions': 0,
                        'self_passes': 0,
                        'ints_caught': 0,
                        'tags': 0,
                        'caps': 0,
                        'raps_thrown': 0,
                        'completions': 0,
                        'ints_thrown': 0,
                        'tagged': 0,
                        'raps_caught': 0,
                        'joined_at': line[0],
                        'left_at': -1
                    }
            elif line[1] == 'time' and line[2]['state'] == 1:
                start_time = line[0]
            elif line[1] == 'playerLeft':
                if end_time == -1:
                    ids[line[2]]['left_at'] = line[0]
            elif line[1] == 'end':
                end_time = line[0]
        ids = [i for i in ids if i]
        for i in ids[1:]:
            i['joined_at'] = max(i['joined_at'], start_time)
            if i['left_at'] == -1:
                i['left_at'] = end_time
        return ids

    def merge_results(self, records):
        final = {}
        for r in records:
            player = r['player']
            if player in final:
                for k in RAW_KEYS:
                    final[player][k] += r[k]
            else:
                final[player] = {k: r[k] for k in RAW_KEYS}
                final[player]['team'] = r['team']
        return final

    def print_box_score(self, final):
        table = build_table(final)
        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        OUTPUT_DIR.mkdir(exist_ok=True)
        
        # Write TXT
        path = OUTPUT_DIR / f'box_score_{timestamp}.txt'
        with open(path, 'w') as f:
            f.write(tabulate.tabulate(table, DISPLAY_HEADERS))
        print(f"Written to {path}")

        # Write CSV
        csv_path = OUTPUT_DIR / f'box_score_{timestamp}.csv'
        with open(csv_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(DISPLAY_HEADERS)
            writer.writerows(table)
        print(f"Written to {csv_path}")


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python box_score.py <ndjson_dir>")
        sys.exit(1)
    BoxScore(sys.argv[1])
