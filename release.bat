@echo off
setlocal
pushd "%~dp0" || exit /b 1

rem Respect JAVA_HOME, then try the Android Studio runtime if Java is absent.
if defined JAVA_HOME goto :check_java_home
where java.exe >nul 2>&1
if not errorlevel 1 goto :build
if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
    goto :build
)
if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" (
    set "JAVA_HOME=%LOCALAPPDATA%\Programs\Android Studio\jbr"
    goto :build
)
echo [ERROR] Set JAVA_HOME to a JDK 21 installation.
goto :failed

:check_java_home
if exist "%JAVA_HOME%\bin\java.exe" goto :build
echo [ERROR] JAVA_HOME does not contain bin\java.exe.
goto :failed

:build
call npm.cmd run android:build
if errorlevel 1 goto :failed
call npm.cmd run electron:package -- --win
if errorlevel 1 goto :failed

echo Android debug APK: android\app\build\outputs\apk\debug\app-debug.apk
echo Windows NSIS installer: release\NodeSpace Setup ^<version^>.exe
popd
exit /b 0

:failed
popd
exit /b 1
