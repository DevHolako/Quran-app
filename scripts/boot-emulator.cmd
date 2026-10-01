@echo off
REM Detached launcher for the Android emulator.
REM Usage:
REM   boot-emulator.cmd start [avd] [accel] [gpu] [cores]
REM   boot-emulator.cmd stop
REM
REM The emulator must be the task's MAIN process: Windows kills every descendant
REM when the task's cmd.exe exits, so `start /b` is not enough to detach it.
REM
REM Defaults are the only combination that survives on a host without WHPX:
REM -gpu off / 2 cores. The software GPU backends and 4 cores both crash qemu
REM with 0xC0000005. See scripts/probe-emulator.js.
setlocal
set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "EMU=%SDK%\emulator\emulator.exe"
set "LOG=%TEMP%\quran-emulator.log"

if /i "%~1"=="stop" goto :stop

set "AVD=quran_api36"
if not "%~2"=="" set "AVD=%~2"
set "ACCEL=off"
if not "%~3"=="" set "ACCEL=%~3"
set "GPU=off"
if not "%~4"=="" set "GPU=%~4"
set "CORES=2"
if not "%~5"=="" set "CORES=%~5"

if not exist "%EMU%" (
  echo emulator introuvable : %EMU% >&2
  exit /b 1
)

rem adb must already be listening, otherwise the VM aborts on startup.
"%SDK%\platform-tools\adb.exe" start-server >nul 2>&1

echo demarrage de l'AVD %AVD% avec -accel %ACCEL% ... > "%LOG%"
"%EMU%" -avd "%AVD%" -accel %ACCEL% -no-window -no-audio -no-boot-anim ^
  -gpu %GPU% -memory 2048 -cores %CORES% -no-snapshot -no-metrics >> "%LOG%" 2>&1
echo code de sortie : %ERRORLEVEL% >> "%LOG%"
exit /b %ERRORLEVEL%

:stop
taskkill /f /im qemu-system-x86_64.exe >nul 2>&1
taskkill /f /im qemu-system-x86_64-headless.exe >nul 2>&1
taskkill /f /im emulator.exe >nul 2>&1
taskkill /f /im netsimd.exe >nul 2>&1
echo arret demande
exit /b 0
