@echo off
REM Tries several emulator configurations to find one that survives software
REM emulation, then reports which (if any) keep a qemu process alive.
REM   probe-emulator.cmd <accel> <gpu> <cores>
setlocal
set "SDK=%LOCALAPPDATA%\Android\Sdk"
set "EMU=%SDK%\emulator\emulator.exe"
set "ACCEL=%~1"
if "%ACCEL%"=="" set "ACCEL=off"
set "GPU=%~2"
if "%GPU%"=="" set "GPU=off"
set "CORES=%~3"
if "%CORES%"=="" set "CORES=2"
set "LOG=%TEMP%\emu-probe.log"

"%SDK%\platform-tools\adb.exe" start-server >nul 2>&1
del /q "%LOG%" >nul 2>&1

echo === accel=%ACCEL% gpu=%GPU% cores=%CORES% === >> "%LOG%"
"%EMU%" -avd quran_api36 -accel %ACCEL% -no-window -no-audio -no-boot-anim ^
  -gpu %GPU% -memory 2048 -cores %CORES% -no-snapshot -no-metrics >> "%LOG%" 2>&1
echo EXITCODE=%ERRORLEVEL% >> "%LOG%"
exit /b 0
