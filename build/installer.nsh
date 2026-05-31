!ifndef nsProcess::FindProcess
    !include "nsProcess.nsh"
!endif

!macro customCheckAppRunning
  ; Matamos os possíveis nomes de processos do ChamaAi no início do instalador/desinstalador
  ; Isso garante que qualquer instância anterior (seja pelo nome do produto ou pelo nome do pacote) seja liberada
  nsProcess::_KillProcess "ChamaAi.exe"
  Pop $R0
  nsProcess::_KillProcess "chamaai-novo.exe"
  Pop $R0
  Sleep 2000
!macroend

!macro customInstall
  ; Aguarda mais 1 segundo para garantir liberação dos arquivos
  Sleep 1000
!macroend

!macro customUnInstall
  ; Garante encerramento completo de todas as instâncias na desinstalação
  nsProcess::_KillProcess "ChamaAi.exe"
  Pop $R0
  nsProcess::_KillProcess "chamaai-novo.exe"
  Pop $R0
  Sleep 2000
!macroend