@echo off
cd /d "%~dp0"
echo Starting NodeSpace...
call npm run electron:dev
pause
