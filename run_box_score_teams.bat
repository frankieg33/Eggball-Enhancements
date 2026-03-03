@echo off
set /p GAMEDAY="Enter game day folder name (e.g. 2024-04-17): "
python "%~dp0box_score_teams.py" "%~dp0NDJSONs\%GAMEDAY%\"
pause
