@echo off
rem Builds the Microsoft Store package for PC Wrapped and certifies a signed test copy of it.
rem   release\PC-Wrapped-<version>-x64.msixupload  -> upload this one to Partner Center
rem   release-test\...msix                         -> throwaway test copy, signed with a local test
rem                                                   certificate, only for the certification kit
rem Logs: audit\store-build.log (build) and audit\store-certify.log (certification).
setlocal EnableDelayedExpansion
title PC Wrapped - pachet pentru Microsoft Store
cd /d "%~dp0..\.."
set "LOG=%CD%\audit\store-build.log"
echo PC Wrapped store build - %DATE% %TIME% > "%LOG%"
echo.
echo  PC Wrapped - pachetul pentru Microsoft Store. Dureaza 10-20 de minute. Nu inchide fereastra.
echo.

call :findnode
if not defined NODE_DIR (
  echo  Node.js lipseste. Ruleaza intai scripts\dev\setup-verify.cmd.
  echo === NO NODE >> "%LOG%"
  goto :done
)
set "PATH=!NODE_DIR!;%PATH%"
set "COREPACK_ENABLE_DOWNLOAD_PROMPT=0"
echo === node dir: !NODE_DIR! >> "%LOG%"

echo  [1/4] Verific codul: teste, tipuri, stil...
(
  echo === install
  call corepack pnpm install
  echo === verify
  call corepack pnpm run verify
) >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Verificarile nu au trecut. Nu construiesc pachetul. Detalii: audit\store-build.log
  echo === STOP: verify failed >> "%LOG%"
  goto :done
)
(
  echo === lint
  call corepack pnpm run lint
  echo === format:check
  call corepack pnpm run format:check
) >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Lint sau formatarea nu au trecut. Nu construiesc pachetul. Detalii: audit\store-build.log
  echo === STOP: lint/format failed >> "%LOG%"
  goto :done
)

echo  [2/4] Construiesc pachetul pentru Store...
echo === build:msix >> "%LOG%"
call corepack pnpm run build:msix >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Construirea pachetului a esuat. Detalii: audit\store-build.log
  echo === STOP: build:msix failed >> "%LOG%"
  goto :done
)
echo === release folder >> "%LOG%"
dir /b release >> "%LOG%" 2>&1

echo  [3/4] Construiesc o copie de test pentru certificare...
if exist release-test rmdir /s /q release-test >> "%LOG%" 2>&1
echo === test build >> "%LOG%"
call node node_modules\electron-builder\cli.js --win msix --config.asar=false --config.electronFuses.onlyLoadAppFromAsar=false --config.msix.identityName=PCWrapped.Test "--config.msix.publisher=CN=PC Wrapped Test" --config.msix.createMsixupload=false --config.directories.output=release-test >> "%LOG%" 2>&1
if errorlevel 1 (
  echo  Copia de test nu s-a construit. Pachetul pentru Store e totusi in folderul release.
  echo === STOP: test build failed >> "%LOG%"
  goto :done
)

echo  [4/4] Testul de certificare Microsoft. Windows iti va cere permisiunea: apasa "Da".
echo === certify >> "%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\store\certify-test-package.ps1"
echo === certify exit %ERRORLEVEL% >> "%LOG%"

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
