@echo off
rem Builds and opens PC Wrapped from the sources (development mode). Log: audit\run-dev.log
setlocal EnableDelayedExpansion
title PC Wrapped - dev
cd /d "%~dp0..\.."
set "NODE_DIR="
for %%N in ("%ProgramFiles%\nodejs" "%LOCALAPPDATA%\Programs\nodejs" "%APPDATA%\nvm\current") do if not defined NODE_DIR if exist "%%~N\node.exe" set "NODE_DIR=%%~N"
rem winget installs Node.js as a portable zip under its Packages folder.
if not defined NODE_DIR for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS*") do for /d %%E in ("%%D\node-v*") do if not defined NODE_DIR if exist "%%E\node.exe" set "NODE_DIR=%%E"
if not defined NODE_DIR (
  echo Node.js nu este instalat. Ruleaza mai intai setup-verify.cmd.
  pause
  goto :eof
)
set "PATH=!NODE_DIR!;%PATH%"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
echo Pornesc PC Wrapped din codul sursa...
call corepack pnpm dev > "%CD%\audit\run-dev.log" 2>&1
if errorlevel 1 (
  echo.
  echo PC Wrapped nu a putut porni. Detaliile sunt in audit\run-dev.log.
  pause
)
endlocal
