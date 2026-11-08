@echo off
echo =================================================================
echo   Building AI Face & Eye Monitoring System (C++ Engine)
echo =================================================================

g++ -std=c++14 -O2 src/main.cpp -o monitor_cpp.exe -lws2_32 -lwinmm -lshell32

if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] monitor_cpp.exe built successfully!
) else (
    echo [ERROR] Compilation failed. Please ensure MinGW g++ is in your PATH.
)
pause
