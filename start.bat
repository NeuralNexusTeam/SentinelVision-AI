@echo off
title SentinelVision AI - Face and Eye Monitoring System
color 0B
echo =====================================================================
echo    SENTINELVISION AI: REAL-TIME FACE AND EYE MONITORING SYSTEM
echo =====================================================================
echo.
echo Launching SentinelVision AI System on Windows...
echo.

cd /d "%~dp0"

python run.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] System failed to start.
    echo Please make sure dependencies are installed via:
    echo     pip install -r requirements.txt
    echo.
    pause
)
