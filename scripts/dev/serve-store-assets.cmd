@echo off
rem Serves the Store screenshots to the Partner Center page in the Claude desktop browser.
setlocal EnableDelayedExpansion
title PC Wrapped - capturi pentru Store (lasa fereastra deschisa)
cd /d "%~dp0..\.."
call :findnode
if not defined NODE_DIR (echo  Node.js lipseste. & pause & goto :eof)
set "PATH=!NODE_DIR!;%PATH%"
echo.
echo  Lasa fereastra deschisa cat timp Claude incarca capturile in Partner Center.
echo.
node scripts\store\serve-assets.cjs
pause
goto :eof

:findnode
set "NODE_DIR="
for %%N in ("%ProgramFiles%\nodejs" "%LOCALAPPDATA%\Programs\nodejs" "%APPDATA%\nvm\current") do if not defined NODE_DIR if exist "%%~N\node.exe" set "NODE_DIR=%%~N"
if not defined NODE_DIR for /d %%D in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenJS.NodeJS*") do for /d %%E in ("%%D\node-v*") do if not defined NODE_DIR if exist "%%E\node.exe" set "NODE_DIR=%%E"
goto :eof
