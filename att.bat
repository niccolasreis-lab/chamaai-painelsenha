@echo off
setlocal enabledelayedexpansion
title CHAMAAI - COMPILADOR E DISTRIBUIDOR LOCAL/OFFLINE

echo ======================================================
echo    CHAMAAI - ATUALIZADOR E DISTRIBUIDOR LOCAL
echo ======================================================
echo.

set "TARGET_DIR=C:\ChamaAi_Atualizacoes"

echo [*] Verificando pasta de destino local...
if not exist "%TARGET_DIR%" (
    echo [*] Criando pasta de destino: %TARGET_DIR%
    mkdir "%TARGET_DIR%"
) else (
    echo [OK] Pasta de destino existente: %TARGET_DIR%
)
echo.

echo [*] Limpando pastas de compilacoes antigas para evitar divergencia de checksum (sha512)...
if exist "release" rd /s /q "release"
if exist "%TARGET_DIR%" del /q "%TARGET_DIR%\*"
echo.

echo [*] Compilando a aplicacao para producao...
echo Isso pode levar de 1 a 2 minutos...
call npm run build:dist
if %errorlevel% neq 0 (
    echo.
    echo [ERRO] Falha ao compilar a aplicacao! Verifique os erros acima.
    pause
    exit /b 1
)

echo.
echo [*] Copiando arquivos compilados para a pasta local...
copy /Y "release\ChamaAi Setup *.exe" "%TARGET_DIR%\" >nul
copy /Y "release\latest.yml" "%TARGET_DIR%\" >nul

if %errorlevel% neq 0 (
    echo [ERRO] Falha ao copiar os arquivos para %TARGET_DIR%!
    pause
    exit /b 1
)

echo.
echo ======================================================
echo      ATUALIZACAO LOCAL CONCLUIDA COM SUCESSO!
echo ======================================================
echo.
echo Os seguintes arquivos foram distribuidos em %TARGET_DIR%:
dir /B "%TARGET_DIR%\ChamaAi Setup *.exe"
dir /B "%TARGET_DIR%\latest.yml"
echo.
echo Agora, qualquer computador na rede ou maquina local ja
echo podera se atualizar offline a partir deste diretorio!
echo.
pause
