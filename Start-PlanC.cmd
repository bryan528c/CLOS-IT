@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 LTS is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node --version
if not exist node_modules\vite\bin\vite.js (
  echo Installing locked dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Installation failed. The error above was preserved.
    pause
    exit /b 1
  )
)
echo CLOs-IT Plan C: http://127.0.0.1:4311/
echo Local demo starts without login. No automatic paid API request.
echo Keep this window open. Ctrl+C stops this app.
call npm.cmd run dev
echo Server stopped. Review any error above.
pause
