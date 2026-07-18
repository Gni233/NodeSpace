@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   NodeSpace - Build and Push
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
echo   Android Studio: https://developer.android.com/studio
echo   OpenJDK: https://adoptium.net/download/
pause
exit /b 1

:hasjava
echo [JDK] %JAVA_HOME%
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo [1/4] Clearing old build artifacts...
del /q "android\app\build\outputs\apk\debug\app-debug.apk" 2>nul
del /q "NodeSpace.apk" 2>nul
del /q "NodeSpace.exe" 2>nul
if exist "release\" rmdir /s /q "release" 2>nul

echo [2/4] Building frontend + Android APK...
set "JAVA_HOME=%JAVA_HOME%"
call npm run android:build
if %errorlevel% neq 0 (
    echo Build failed! Check errors above.
    pause
    exit /b %errorlevel%
)

echo [2.5/4] Copying APK to repo...
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "NodeSpace.apk" >nul
if %errorlevel% neq 0 (
    echo APK copy failed! APK not found at expected path.
    pause
    exit /b %errorlevel%
)
echo   APK: NodeSpace.apk

echo [3/4] Building Electron EXE...
:: Use mirror for Electron downloads (GitHub is often unreachable)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
call npx electron-builder --win
if %errorlevel% neq 0 (
    echo EXE build failed! Check errors above.
    pause
    exit /b %errorlevel%
)
:: Find the built EXE and copy to repo root
for %%f in ("release\*.exe") do (
    copy /y "%%f" "NodeSpace.exe" >nul
    echo   EXE: NodeSpace.exe
)
if not exist "NodeSpace.exe" (
    echo EXE not found in release folder!
    pause
    exit /b 1
)

echo [4/4] Creating GitHub Release...
:: Read version from package.json
for /f "tokens=2 delims=: " %%v in ('findstr /c:"\"version\"" package.json') do set VERSION=%%~v
:: Strip trailing quote and comma (JSON artifact)
set VERSION=%VERSION:"=%
set VERSION=%VERSION:,=%
set TAG=v%VERSION%
echo   Version: %VERSION%  Tag: %TAG%

:: Delete an earlier incomplete release/tag (may not exist, ignore error)
gh release delete %TAG% --yes --cleanup-tag 2>nul

:: Create as draft first, then upload each asset separately. This makes a slow or
:: failed upload visible and prevents publishing a release without both assets.
echo   [Release 1/4] Creating draft...
gh release create %TAG% --draft --title "NodeSpace" --notes "Automated build" --target main
if errorlevel 1 (
    echo [ERROR] Could not create GitHub Release draft.
    echo Run: gh auth status
    pause
    exit /b 1
)

echo   [Release 2/4] Uploading APK (about 72 MB)...
gh release upload %TAG% "NodeSpace.apk"
if errorlevel 1 (
    echo [ERROR] APK upload failed. The release remains a draft for inspection.
    pause
    exit /b 1
)

echo   [Release 3/4] Uploading EXE (about 180 MB)...
gh release upload %TAG% "NodeSpace.exe"
if errorlevel 1 (
    echo [ERROR] EXE upload failed. The release remains a draft for inspection.
    pause
    exit /b 1
)

echo   [Release 4/4] Publishing release...
gh release edit %TAG% --draft=false --latest
if errorlevel 1 (
    echo [ERROR] Assets uploaded, but publishing failed. The release remains a draft.
    pause
    exit /b 1
)
echo   Release %TAG% published with NodeSpace.apk + NodeSpace.exe

echo.
echo [PUSH] Waiting for stable GitHub connection...
echo.
set cons=0

:loop
if not defined att set att=0
set /a att+=1
echo [Attempt !att!] Testing GitHub API...
gh api rate_limit >nul 2>&1
if not errorlevel 1 (
    set /a cons+=1
    echo   OK - consecutive: !cons! / 3
) else (
    set cons=0
    echo   FAIL - resetting counter
)
echo.
if !cons! geq 3 goto :dopush
timeout /t 5 /nobreak >nul
goto :loop

:dopush
echo Connection stable, pushing to GitHub...
echo.
git add -A
git commit -m "update build" 2>nul
:: Pull remote first to avoid non-fast-forward rejection
git pull origin main --rebase 2>nul
git push origin main
if %errorlevel% neq 0 (
    echo Push failed! Check network and git config.
    goto :end
)
echo Push OK!

:: ==== WeChat notification via Claude Code bot ====
echo.
echo Sending WeChat notification...
powershell -NoProfile -Command ^
  "$body = @{^
    msgtype='text';^
    text=@{content='[NodeSpace] Build & Push completed! APK + EXE ready.'};^
    chatid='o9cq808aOUf2kWKYh1QeigFUY8fI@im.wechat'^
  } | ConvertTo-Json -Compress; ^
  try { ^
    Invoke-RestMethod -Uri 'https://ilinkai.weixin.qq.com/im/apis/agent/chat/send-message' ^
      -Method Post -Body $body -ContentType 'application/json' ^
      -Headers @{Authorization='7eee157260a0@im.bot:06000039ed92436b671c7856435b1c6ec07972'} ^
      -TimeoutSec 10 | Out-Null; ^
    Write-Host 'WeChat message sent!' ^
  } catch { Write-Host 'WeChat send failed (non-blocking): ' $_.Exception.Message }"
echo.

:: ==== Windows toast notification (fallback) ====
powershell -NoProfile -Command ^
  "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; ^
   [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null; ^
   $template = '<toast><visual><binding template=\"ToastGeneric\"><text>NodeSpace</text><text>Build and push completed! APK + EXE ready.</text></binding></visual></toast>'; ^
   $xml = New-Object Windows.Data.Xml.Dom.XmlDocument; $xml.LoadXml($template); ^
   $toast = New-Object Windows.UI.Notifications.ToastNotification($xml); ^
   [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('NodeSpace').Show($toast)" 2>nul

:end
echo.
echo ========================================
echo   Done!
echo   APK: NodeSpace.apk
echo   EXE: NodeSpace.exe
echo ========================================
pause
