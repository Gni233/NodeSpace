@echo off
setlocal
cd /d "%~dp0" || exit /b 1
call npm.cmd run electron:dev
set "nodespace_exit=%errorlevel%"
if not "%nodespace_exit%"=="0" pause
exit /b %nodespace_exit%
