@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Hex World - Demo Server
pushd "%~dp0"
if errorlevel 1 exit /b 1

where node.exe >nul 2>&1
if errorlevel 1 goto :missing_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :missing_node
node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19 || major === 22 && minor >= 12 || major > 22) ? 0 : 1)"
if errorlevel 1 goto :missing_node

if exist "node_modules\" goto :build
echo Installing dependencies from package-lock.json...
call npm.cmd ci
if errorlevel 1 goto :failed

:build
echo Building the map library and demo assets...
call npm.cmd run build
if errorlevel 1 goto :failed

echo.
echo Starting http://127.0.0.1:3000/ and opening your browser.
echo Keep this window open while using the demo. Press Ctrl+C to stop the server.
echo If port 3000 is already in use, stop its existing server first.
call npm.cmd run server -- -a 127.0.0.1 -o
if errorlevel 1 goto :failed
popd
endlocal
exit /b 0

:missing_node
echo ERROR: Install Node.js 20.19+ within v20, or Node.js 22.12+ with npm.
goto :failed

:failed
echo.
echo Startup stopped. Check the error above, then run this file again.
pause
popd
endlocal
exit /b 1
