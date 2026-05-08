!macro customInit
  ; Mata apenas os processos do ChamaAí antes de instalar/atualizar
  ; Usa o nome exato do produto para nao matar processos alheios
  nsExec::ExecToStack 'cmd /c taskkill /F /IM "ChamaAí.exe" /T 2>nul'
  Pop $0
  ; Espera o Windows liberar as travas de arquivo
  Sleep 2000
!macroend
