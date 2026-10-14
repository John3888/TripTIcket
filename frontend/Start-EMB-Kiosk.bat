@echo off
REM ============================================================
REM  EMB Trip Ticket - Kiosk launcher (Google Chrome)
REM  Double-click to open the kiosk fullscreen with automatic,
REM  no-popup thermal printing (--kiosk-printing).
REM
REM  IMPORTANT: opens a DEDICATED Chrome profile so the silent
REM  print flag actually takes effect even if Chrome is already
REM  running on your normal profile.
REM
REM  Fullscreen but NOT locked kiosk mode, so you can still:
REM    - Adjust scale/zoom:  Ctrl +   /   Ctrl -   (Ctrl 0 = reset)
REM    - Toggle fullscreen:  F11
REM
REM  BEFORE FIRST USE (this is what makes paper come out):
REM   1) Printer target is fixed below as EPSON TM-T100 Receipt.
REM      (Turn OFF "Let Windows manage my default printer".)
REM      Do NOT leave "Microsoft Print to PDF" as default.
REM   2) In the thermal printer's Printing Preferences: paper =
REM      80mm roll, and cutter = cut after each document/job
REM      (so the two copies print and cut as separate receipts).
REM  The Trip Ticket frontend and backend must be running.
REM ============================================================

set "URL=http://localhost:3006/request"
set "PROFILE=%LocalAppData%\EMBKioskProfile"
set "RECEIPT_PRINTER=EPSON TM-T100 Receipt"

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

REM Set the receipt printer as Windows default and disable browser
REM print headers/footers (date, page title, URL) in the dedicated profile.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Configure-EMB-Kiosk-Print.ps1" -ProfilePath "%PROFILE%" -PrinterName "%RECEIPT_PRINTER%"

REM  --kiosk-printing   = print silently to the default printer (no popup)
REM  --user-data-dir    = dedicated profile so the flag is honored
REM  --start-fullscreen = fullscreen but keep zoom (Ctrl +/-) and F11
start "" "%BROWSER%" --kiosk-printing --user-data-dir="%PROFILE%" --start-fullscreen "%URL%"

