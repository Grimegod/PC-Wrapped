@echo off
rem Installs what PC Wrapped needs and runs every check. Everything is also written to
rem audit\setup-verify.log. If Node.js is missing it is installed for this user only (winget).
setlocal EnableDelayedExpansion
title PC Wrapped - setup and verify
cd /d "%~dp0..\.."
set "LOG=%CD%\audit\setup-verify.log"
echo PC Wrapped setup and verify - %DATE% %TIME% > "%LOG%"
echo.
echo  PC Wrapped - instalare si verificare. Nu inchide fereastra.
echo.

call :findnode
if not defined NODE_DIR (
  echo  [1/3] Node.js nu este instalat. Il instalez pentru utilizatorul tau prin winget...
  echo === installing Node.js LTS with winget >> "%LOG%"
  where winget >> "%LOG%" 2>&1
  winget install -e --id OpenJS.NodeJS.LTS --scope user --silent --accept-package-agreements --accept-source-agreements >> "%LOG%" 2>&1
  call :findnode
)
if not defined NODE_DIR (
  echo === NO NODE FOUND after winget >> "%LOG%"
  echo.
  echo  Node.js nu a putut fi instalat automat. Detaliile sunt in audit\setup-verify.log.
  goto :done
)
echo === node dir: !NODE_DIR! >> "%LOG%"
set "PATH=!NODE_DIR!;%PATH%"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"

echo  [2/3] Instalez dependentele proiectului (cateva minute)...
(
  echo === node
  node --version
  echo === pnpm
  call corepack pnpm --version
  echo === install
  call corepack pnpm install
) >> "%LOG%" 2>&1

echo  [3/3] Rulez verificarile si testele...
(
  echo === check:deps
  call corepack pnpm run check:deps
  echo === typecheck
  call corepack pnpm run typecheck
  echo === lint
  call corepack pnpm run lint
  echo === format:check
  call corepack pnpm run format:check
  echo === test
  call corepack pnpm test
  echo === build:ts
  call corepack pnpm run build:ts
) >> "%LOG%" 2>&1

:done
echo === finished %DATE% %TIME% >> "%LOG%"
echo.
echo  Gata. Poti inchide fereastra si scrie "gata" in conversatie.
pause >nul
endlocal
goto :eof

:findnode
set "NODE_DIR="
for %%N in ("%ProgramFiles%\nodejs" "%LOCALAPPDATA%\Programs\nodejs" "%APPDATA%\nvm\current" "%ProgramFiles%\nodejs-lts") do if not defined NODE_DIR if exist "%%~N\node.exe" set "NODE_DIR=%%~N"
rem winget installs Node.js as a portable zip under its Packages folder.
if not defined NODE_DIR for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS*") do for /d %%E in ("%%D\node-v*") do if not defined NODE_DIR if exist "%%E\node.exe" set "NODE_DIR=%%E"
goto :eof
