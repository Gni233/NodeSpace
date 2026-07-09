@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   NodeSpace - Build
echo ========================================
echo.
cd /d "%~dp0"

:: Auto-detect JDK (prefer Android Studio bundled)
if defined JAVA_HOME goto :hasjava

for %%d in (
    "C:\Program Files\Android\Android Studio\jbr"
    "C:\Program Files\Android\Android Studio\jre"
    "%LOCALAPPDATA%\Android\Sdk\jbr"
    "%LOCALAPPDATA%\Programs\Android Studio\jbr"
) do (
    if exist %%d\bin\java.exe (
        set JAVA_HOME=%%d
        goto :hasjava
    )
)

:: JDK 21 (required by Gradle 9.x / newer AGP)
for /d %%j in ("D:\cc\jdk21\jdk-21*") do (
    if exist "%%j\bin\java.exe" (
        set "JAVA_HOME=%%j"
        goto :hasjava
    )
)

if exist "D:\cc\jdk21\jdk-21.0.11+10\bin\java.exe" (
    set "JAVA_HOME=D:\cc\jdk21\jdk-21.0.11+10"
    goto :hasjava
)

if exist "C:\Program Files\Microsoft\jdk-17*\bin\java.exe" (
    for /d %%j in ("C:\Program Files\Microsoft\jdk-17*") do set JAVA_HOME=%%j
    goto :hasjava
)

for /d %%j in ("D:\cc\jdk17\jdk-17*") do (
    if exist "%%j\bin\java.exe" (
        set "JAVA_HOME=%%j"
        goto :hasjava
    )
)

if exist "D:\cc\jdk17\jdk-17.0.19+10\bin\java.exe" (
    set "JAVA_HOME=D:\cc\jdk17\jdk-17.0.19+10"
    goto :hasjava
)

echo [ERROR] No JDK found!
echo Please install Android Studio or OpenJDK 17/21.
pause
exit /b 1

:hasjava
echo [JDK] %JAVA_HOME%
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo [1/3] Clearing old build artifacts...
del /q "NodeSpace.apk" 2>nul
del /q "NodeSpace.exe" 2>nul
if exist "release\" rmdir /s /q "release" 2>nul

echo [2/3] Building APK + EXE...
set "JAVA_HOME=%JAVA_HOME%"
call npm run android:build
if %errorlevel% neq 0 (
    echo Android build failed! Check errors above.
    pause
    exit /b %errorlevel%
)
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "NodeSpace.apk" >nul
echo   APK: NodeSpace.apk

:: Use mirror for Electron downloads (GitHub is often unreachable)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo EXE build failed! Check errors above.
    pause
    exit /b %errorlevel%
)
for %%f in ("release\*.exe") do copy /y "%%f" "NodeSpace.exe" >nul
echo   EXE: NodeSpace.exe

echo [3/3] Pushing to GitHub...
git add -A
git commit -m "update build" 2>nul
git pull origin main --rebase 2>nul
git push origin main
if %errorlevel% neq 0 (
    echo Push failed! Check network and git config.
    pause
    exit /b %errorlevel%
)
echo Push OK!

echo.
echo ========================================
echo   Done!
echo   APK: NodeSpace.apk
echo   EXE: NodeSpace.exe
echo ========================================
pause
