@echo off
rem Double-click to start the Rivers & Dams dashboard at http://localhost:8000
rem Keep this window open while you use the site; close it (or press Ctrl+C) to stop.
cd /d "%~dp0"
if not exist "web\data\summary.json" (
  echo Building the website data first - this takes about 4 minutes...
  python build_web_data.py || goto :error
)
python serve.py
goto :eof

:error
echo.
echo Building the data failed - see the message above.
pause
