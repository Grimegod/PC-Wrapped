@echo off
rem Re-runs only the certification of the test package built by build-store.cmd (no rebuild).
title PC Wrapped - test de certificare
cd /d "%~dp0..\.."
echo.
echo  Testul de certificare Microsoft. Windows iti cere permisiunea: apasa "Da". Dureaza cateva minute.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\store\certify-test-package.ps1"
echo.
echo  Gata. Poti inchide fereastra si scrie "gata" in conversatie.
pause >nul
