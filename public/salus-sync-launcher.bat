@echo off
title SALUS Sync Server - Sanatorio Argentino
color 0A

echo.
echo ==================================================
echo   SALUS Sync Server - Sanatorio Argentino
echo   Instalador y Launcher Automatico
echo ==================================================
echo.

:: Carpeta de instalacion local
set INSTALL_DIR=%USERPROFILE%\SALUS_Sync
set REPO_RAW=https://raw.githubusercontent.com/lucasmmg12/quirofano/main

:: 1. Verificar Node.js
echo [1/5] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Node.js no esta instalado.
    echo  Descargue e instale Node.js desde: https://nodejs.org
    echo  Luego ejecute este archivo de nuevo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo      Node.js %%v encontrado

:: 2. Crear carpeta de instalacion
echo [2/5] Preparando carpeta de instalacion...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: 3. Descargar archivos del repositorio
echo [3/5] Descargando archivos desde GitHub...
echo      Descargando index.js...
curl -sL "%REPO_RAW%/sync-server/index.js" -o "%INSTALL_DIR%\index.js"
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: No se pudo descargar index.js
    pause
    exit /b 1
)

echo      Descargando package.json...
curl -sL "%REPO_RAW%/sync-server/package.json" -o "%INSTALL_DIR%\package.json"

echo      Generando archivo .env local...
echo VITE_SUPABASE_URL=https://hakysnqiryimxbwdslwe.supabase.co > "%INSTALL_DIR%\.env"
echo SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhha3lzbnFpcnlpbXhid2RzbHdlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0MjI3NCwiZXhwIjoyMDg1NjE4Mjc0fQ.v0Zw7yFjGKJX8xsMCZJPwRyhr2eNd1gjASsI7qSK0YM >> "%INSTALL_DIR%\.env"

:: 4. Instalar dependencias
echo [4/5] Instalando dependencias (primera vez puede demorar)...
cd /d "%INSTALL_DIR%"

:: Ajustar dotenv path
if not exist "%INSTALL_DIR%\..\SALUS_Sync\.env" (
    copy /y "%INSTALL_DIR%\.env" "%INSTALL_DIR%\.env" >nul
)
powershell -NoProfile -Command "(Get-Content '%INSTALL_DIR%\index.js') -replace \"resolve\(__dirname, '\.\.', '\.env'\)\", \"resolve(__dirname, '.env')\" | Set-Content '%INSTALL_DIR%\index.js'"

call npm install --production 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Fallo la instalacion de dependencias.
    pause
    exit /b 1
)

:: 5. Iniciar servidor
echo [5/5] Iniciando SALUS Sync Server...
echo.
echo ==================================================
echo   Servidor INICIADO en puerto 3456
echo.
echo   Vuelva al navegador y presione
echo   el boton "Sync SALUS"
echo.
echo   NO CIERRE esta ventana mientras
echo   use el sistema.
echo ==================================================
echo.

:: Asegurarnos de estar en el directorio correcto
cd /d "%INSTALL_DIR%"
node index.js

echo.
echo El servidor se ha detenido.
pause
