# Eggball Enhancements

Scripts and browser enhancements for the Eggball game mode inside [TagPro](https://tagpro.koalabeast.com).

---

## EggPro.user.js — In-Game Enhancements

A Tampermonkey userscript that improves the Eggball experience with a zoomed-out view, extended click area, custom egg visuals, auto-shoot, and more.

### Installation

1. Install [Tampermonkey](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo) for Chrome or Edge.

2. Install the script:
   - Open `EggPro.user.js` from this repo in Tampermonkey (or install directly from the [original Gist](https://gist.github.com/catalyst518/f28accf3d14385470a330ab80c768ee1))
   - In the Tampermonkey dashboard, click the pencil icon to edit
   - Scroll to the `SETTINGS` section and customize as desired
   - Save (do not save to disk)

3. The script runs automatically when you join an Eggball game at `tagpro.koalabeast.com`.

### Notable Settings (all opt-in)

| Setting | Default | Description |
|---|---|---|
| `lock_ball` | `true` | Lock camera to your ball |
| `pp_egg` | `true` | Pixel-perfect egg sprite |
| `imp_map` | `true` | Improved map overlay |
| `extend_click` | `true` | Click outside field to aim/shoot |
| `auto_shoot` | `false` | Auto-shoot on egg pickup (hold Shift) |
| `aim_line` | `false` | Draw aiming line to cursor |
| `highlight` | `false` | Pink ring around your ball |
| `score_difference` | `true` | Show score differential |
| `boat_notice` | `true` | Alert on raptor boat |

---

## Stats Scripts — Box Scores & Career Tracking

### Requirements

```
pip install ndjson tabulate
```

### Getting game recordings (NDJSONs)

1. Install the [tagpro-vcr](https://github.com/bash-tp/tagpro-vcr) Tampermonkey script to record games automatically.

2. In the tagpro-vcr script, bump these values up so more games are saved:
   ```
   this._save = 100;
   this._shortSeconds = 30;
   ```

3. After playing, go to the TagPro replay viewer, find your games, and download them as `.ndjson` files.

### Folder structure

```
NDJSONs/
  Last Session/    ← put this session's NDJSONs here before running box score
  All Games/       ← copy every session's NDJSONs here to build career history
```

**No player lists needed** — all players are auto-detected from the files.

### Workflow

1. Download this session's NDJSONs from the TagPro replay viewer
2. Drop them into `NDJSONs/Last Session/` (replace the previous session's files)
3. Also copy them into `NDJSONs/All Games/` to accumulate history
4. Double-click the bat file for the report you want

---

### box_score.py — Last session, all players

Generates a box score for everyone in the last session. All players in one table sorted by Bad% (best first).

```
python box_score.py "NDJSONs/Last Session/"
```

Or double-click **`run_box_score.bat`**.

Output: `NDJSONs/Last Session/box_score.txt`

---

### box_score_teams.py — Last session, split by team

Same as above but splits into Team 1 and Team 2 using the in-game team assignments from the NDJSON. Best used for sessions where teams stayed fixed the whole time.

```
python box_score_teams.py "NDJSONs/Last Session/"
```

Or double-click **`run_box_score_teams.bat`**.

Output: `NDJSONs/Last Session/box_score_teams.txt`

---

### historical_stats.py — Career tracking across all sessions

Reads every NDJSON in `All Games/`, groups them by session date, and outputs a box score per session followed by all-time career totals. Replaces manual spreadsheet tracking.

```
python historical_stats.py "NDJSONs/All Games/"
```

Or double-click **`run_historical_stats.bat`**.

Output: `NDJSONs/All Games/historical_stats.txt`

---

### Box score columns explained

| Column | Description |
|---|---|
| Hold | Total seconds holding the egg |
| Egg Start | Times first receiving the egg each point |
| Receptions | Catches from a teammate |
| Ints Caught | Interceptions (catches from opponents) |
| Tags | Times tagging an opponent mid-air |
| Touches | Egg Start + Receptions + Ints Caught + Tags |
| Hold Time | Average seconds per touch |
| Self Passes | Passes caught by yourself |
| Touches w/ SP | Touches including self passes |
| Completions | Successful passes to a teammate |
| Caps | Points scored |
| Raps Thrown | Raptor plays initiated |
| Raps Caught | Raptor plays received |
| Good | Completions + Caps + Raps Thrown + Raps Caught |
| Good % | Good / Touches (can exceed 100%) |
| Ints Thrown | Passes intercepted by opponents |
| Tagged | Times tagged mid-air by opponents |
| Bad | Ints Thrown + Tagged |
| Bad % | Bad / Touches — lower is better, sorted ascending |

---

## Optional: Highlight clips

The [TagPro Replays](https://chromewebstore.google.com/detail/tagproreplays/ejbnakhldlocljfcglmeibhhdnmmcodh) Chrome extension lets you clip highlights from recorded games.
