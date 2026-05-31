!ifndef nsProcess::FindProcess
    !include "nsProcess.nsh"
!endif

!macro customCheckAppRunning
  ; Matamos o processo ChamaAi.exe no início do instalador/desinstalador
  ; Isso garante que o desinstalador anterior (caso exista) encontre o processo morto
  ; e não exiba a tela "Não é possível fechar o ChamaAi".
  nsProcess::_KillProcess "ChamaAi.exe"
  Pop $R0
  Sleep 2000
!macroend

!macro customInstall
  ; Aguarda mais 1 segundo para garantir liberação dos arquivos
  Sleep 1000
!macroend

!macro customUnInstall
  ; Garante encerramento completo na desinstalação
  nsProcess::_KillProcess "ChamaAi.exe"
  Pop $R0
  Sleep 2000
!macroend