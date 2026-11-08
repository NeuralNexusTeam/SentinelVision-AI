@echo off
title Build SentinelVision AI (C++ Engine)
color 0A
echo =====================================================================
echo    COMPILING SENTINELVISION AI MONITORING SYSTEM (C++)
echo =====================================================================
echo.
echo Invoking MinGW GCC C++14 Compiler...
echo.

cd /d "%~dp0"

g++ -std=c++14 -O2 src/main.cpp -o sentinel_vision.exe -lws2_32 -lwinmm -lshell32

if %ERRORLEVEL% EQU 0 (
    echo.
    echo =====================================================================
    echo [SUCCESS] sentinel_vision.exe built successfully!
    echo Run the application by double-clicking run.bat
    echo =====================================================================
) else (
    echo.
    echo [ERROR] Compilation failed. Please ensure MinGW g++ is in your PATH.
)
echo.
pause
