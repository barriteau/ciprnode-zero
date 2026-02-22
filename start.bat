@echo off
REM Ciprnode Windows Start Script
REM Ensure ciprnode.exe is in the same directory or dist/
cd /d "%~dp0"
if exist "dist\ciprnode.exe" (
    echo Starting Ciprnode from dist...
    dist\ciprnode.exe
) else if exist "ciprnode.exe" (
    echo Starting Ciprnode...
    ciprnode.exe
) else (
    echo Ciprnode executable not found! Please run 'deno task build' first.
    pause
    exit /b 1
)
pause
