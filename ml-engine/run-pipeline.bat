@echo off
REM Update harian modul ML SMART-Mataram (double-click untuk jalankan).
REM Menjalankan: sync gangguan -> predict_cause -> forecast cuaca -> skor risiko H+1.

cd /d "%~dp0"

echo ===============================================
echo   SMART-Mataram ML - Update Harian
echo   %date% %time%
echo ===============================================
echo.

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] venv tidak ditemukan di .venv\Scripts\python.exe
  echo Pastikan Anda menjalankan file ini di dalam folder ml-engine
  echo dan venv sudah dibuat.
  echo.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -m src.pipeline
set EXITCODE=%ERRORLEVEL%

echo.
if "%EXITCODE%"=="0" (
  echo ===============================================
  echo   SELESAI - pipeline berhasil dijalankan.
  echo ===============================================
) else (
  echo ===============================================
  echo   GAGAL - cek pesan error di atas (kode %EXITCODE%).
  echo ===============================================
)
echo.
echo Tekan tombol apa saja untuk menutup jendela ini...
pause >nul
