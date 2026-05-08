@echo off
setlocal
title RESTAURACAO FISICA - CHAMAAI

echo ======================================================
echo       CHAMAAI - RESTAURACAO DE BACKUP FISICO
echo ======================================================
echo.
echo Este script vai restaurar os dados da pasta:
echo backup_2026-05-07
echo.
echo ATENCAO: Isso vai substituir as configuracoes atuais!
echo.
pause

set "BACKUP_DIR=%~dp0backup_2026-05-07"
set "DEST_DIR=C:\ChamaAi"

echo.
echo [1/4] Encerrando processos...
taskkill /F /IM "ChamaA*.exe" /T 2>nul
taskkill /F /IM "node.exe" /T 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/4] Restaurando Banco de Dados...
if exist "%BACKUP_DIR%\database.sqlite" (
    copy /Y "%BACKUP_DIR%\database.sqlite" "%DEST_DIR%\database.sqlite"
    echo Banco de dados restaurado.
) else (
    echo ERRO: Arquivo database.sqlite nao encontrado na pasta de backup!
    pause
    exit /b
)

echo.
echo [3/4] Restaurando Midias e Uploads...
if exist "%BACKUP_DIR%\uploads" (
    if not exist "%DEST_DIR%\uploads" mkdir "%DEST_DIR%\uploads"
    xcopy "%BACKUP_DIR%\uploads\*" "%DEST_DIR%\uploads\" /E /I /H /Y
    echo Pasta de uploads restaurada.
)

echo.
echo [4/4] Limpando Caches antigos...
if exist "%DEST_DIR%\Cache" rd /s /q "%DEST_DIR%\Cache"
if exist "%DEST_DIR%\Code Cache" rd /s /q "%DEST_DIR%\Code Cache"

echo.
echo ======================================================
echo           RESTAURACAO CONCLUIDA COM SUCESSO!
echo ======================================================
echo.
echo O sistema foi restaurado para o estado de 07/05/2026.
echo.
echo [!] Tentando abrir o ChamaAi automaticamente...

:: Usamos um loop para encontrar o EXE mesmo com acento
set "FOUND_EXE="
for /f "delims=" %%i in ('dir /b /s "%LOCALAPPDATA%\Programs\chamaai-novo\ChamaA*.exe" ^| findstr /v /i "Uninstall"') do (
    set "FOUND_EXE=%%i"
)

if defined FOUND_EXE (
    echo Abrindo: %FOUND_EXE%
    start "" "%FOUND_EXE%"
    echo Sistema iniciado!
) else (
    echo [Aviso] Nao consegui localizar o ChamaAí instalado. 
    echo Por favor, abra-o manualmente pelo atalho da Area de Trabalho.
)

echo.
pause
