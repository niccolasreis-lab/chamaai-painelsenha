@echo off
setlocal enabledelayedexpansion
title CHAMAAI - ATUALIZADOR GIT (DEV/SUPORTE)

echo ======================================================
echo       CHAMAAI - ATUALIZADOR GIT (DEV/SUPORTE)
echo ======================================================
echo.

:: 1. Verificar se o Git esta instalado
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Git nao encontrado no sistema!
    pause
    exit /b 1
)

echo [*] Buscando atualizacoes no repositorio remoto...
git fetch origin main

:: Verificar se ha alteracoes locais (tracked e untracked)
for /f "delims=" %%i in ('git status --porcelain') do set "HAS_CHANGES=1"

:: Obter Hashes
for /f %%i in ('git rev-parse HEAD') do set "LOCAL_HASH=%%i"
for /f %%i in ('git rev-parse origin/main') do set "REMOTE_HASH=%%i"

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo [OK] O seu sistema ja esta na versao mais recente do Git!
    echo Hash local: %LOCAL_HASH%
    echo.
    set /p "FORCE_REBUILD=Deseja forcar recompilacao e reinicio mesmo assim? (S/N): "
    if /i not "!FORCE_REBUILD!"=="S" (
        goto LAUNCH
    )
) else (
    echo [NOVO] Uma nova versao foi encontrada no Git!
    echo.
    
    if defined HAS_CHANGES (
        echo [AVISO] Alteracoes locais detectadas.
        echo Salvando alteracoes temporariamente ^(git stash^)...
        git stash
        if !errorlevel! neq 0 (
            echo [ERRO] Falha ao executar git stash. Abortando atualizacao.
            pause
            exit /b 1
        )
    )
    
    echo [*] Atualizando codigo-fonte ^(git pull^)...
    git pull origin main
    if !errorlevel! neq 0 (
        echo [ERRO] Falha ao executar git pull. Verifique conflitos ou conexao.
        if defined HAS_CHANGES git stash pop
        pause
        exit /b 1
    )
    
    if defined HAS_CHANGES (
        echo [*] Restaurando alteracoes locais salvas...
        git stash pop
        if !errorlevel! neq 0 (
            echo [ERRO] Conflito detectado ao restaurar stash. Resolva os conflitos manualmente.
            pause
            exit /b 1
        )
    )
)

echo.
echo [*] Encerrando processos especificos do ChamaAi...
taskkill /F /IM "ChamaA*.exe" /T 2>nul
taskkill /F /IM "electron.exe" /T 2>nul
:: Mata processos node executando scripts do chamaai especificamente
powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'chamaai' -or $_.CommandLine -match 'start-server' } | Stop-Process -Force" 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [*] Atualizando dependencias e pacotes...
call npm install

echo.
echo [*] Recompilando modulos nativos...
call npm run rebuild:native

echo.
echo [*] Compilando a aplicacao...
call npm run build

echo.
echo ======================================================
echo        ATUALIZACAO CONCLUIDA COM SUCESSO!
echo ======================================================
echo.

:LAUNCH
set /p "START_APP=Deseja iniciar o sistema agora em modo dev? (S/N): "
if /i "%START_APP%"=="S" (
    echo [*] Iniciando o sistema...
    start cmd /k "npm run dev"
)

echo.
pause >nul
exit
