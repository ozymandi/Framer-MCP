@echo off
setlocal

echo Installing dependencies...
call npm install
if errorlevel 1 goto :err

echo.
echo Building...
call npm run build
if errorlevel 1 goto :err

echo.
echo Done. dist\server.js is ready for LM Studio.
echo See README in chat / project root for the mcp.json snippet.
exit /b 0

:err
echo.
echo Setup failed. See the messages above.
exit /b 1
