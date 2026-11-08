@echo off
title SentinelVision AI (C++ Engine)
color 0B
echo =====================================================================
echo    STARTING SENTINELVISION AI MONITORING SYSTEM (C++)
echo =====================================================================
echo.

cd /d "%~dp0"

if not exist sentinel_vision.exe (
    echo [Notice] Executable not found. Compiling first...
    call build.bat
)

sentinel_vision.exe

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application terminated with error code %ERRORLEVEL%.
    pause
)
