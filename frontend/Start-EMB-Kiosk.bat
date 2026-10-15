@echo off
REM EMB Trip Ticket kiosk. Receipts print directly through the backend.
REM Configure the printer in backend/.env. Browser print flags are unnecessary.
REM Change URL below for the deployed frontend.

set "URL=http://localhost:3006/request"
set "PROFILE=%LocalAppData%\EMBKioskProfile"


REM --- Find Google Chrome (fall back to Edge) ---
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

if not defined BROWSER (
  echo Could not find Google Chrome or Edge automatically.
  echo Please edit this file and set BROWSER to your browser path.
  pause
  exit /b 1
)

start "" "%BROWSER%" --user-data-dir="%PROFILE%" --start-fullscreen "%URL%"

