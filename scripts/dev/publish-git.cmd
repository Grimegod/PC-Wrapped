@echo off
rem Commits the current project state, tags the release and pushes both to GitHub (origin/main).
rem Everything is logged to audit\publish-git.log. Git may open a browser window to sign in to GitHub.
setlocal EnableDelayedExpansion
title PC Wrapped - actualizare GitHub
cd /d "%~dp0..\.."
set "LOG=%CD%\audit\publish-git.log"
echo PC Wrapped publish - %DATE% %TIME% > "%LOG%"
echo.
echo  PC Wrapped - trimit codul si site-ul pe GitHub. Daca se deschide o fereastra de autentificare GitHub, conecteaza-te.
echo.

set "GIT=git"
where git >nul 2>&1 || (
  if exist "%ProgramFiles%\Git\cmd\git.exe" (set "GIT=%ProgramFiles%\Git\cmd\git.exe") else (
    echo  Git nu este instalat. Il instalez prin winget...
    winget install -e --id Git.Git --silent --accept-package-agreements --accept-source-agreements >> "%LOG%" 2>&1
    set "GIT=%ProgramFiles%\Git\cmd\git.exe"
  )
)
echo === git: !GIT! >> "%LOG%"

(
  echo === branch and remote
  "!GIT!" rev-parse --abbrev-ref HEAD
  "!GIT!" remote -v
  echo === pull
  "!GIT!" pull --rebase --autostash origin main
  echo === status before
  "!GIT!" status --short
  echo === add
  "!GIT!" add -A
  echo === staged
  "!GIT!" diff --cached --stat
  echo === identity
  "!GIT!" config user.name >nul 2>&1 || "!GIT!" config user.name "PC Wrapped"
  "!GIT!" config user.email >nul 2>&1 || "!GIT!" config user.email "pcwrapped@users.noreply.github.com"
  "!GIT!" config user.name
  "!GIT!" config user.email
  echo === commit
  "!GIT!" commit -F scripts\dev\commit-message.txt
  echo === tag
  "!GIT!" tag -a v1.3.0 -m "PC Wrapped 1.3.0"
  echo === push
  "!GIT!" push origin main
  "!GIT!" push origin v1.3.0
  echo === log
  "!GIT!" log --oneline -3
  echo === status after
  "!GIT!" status --short --branch
) >> "%LOG%" 2>&1

echo === finished %DATE% %TIME% >> "%LOG%"
echo.
echo  Gata. Poti inchide fereastra si scrie "gata" in conversatie.
pause >nul
endlocal
