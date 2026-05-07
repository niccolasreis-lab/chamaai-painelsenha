!macro customInit
  ; Mata todos os processos do ChamaAí antes de instalar/atualizar
  ; Isso evita o erro "File in Use" do NSIS no Windows
  nsExec::ExecToLog 'taskkill /f /im "ChamaAí.exe" /t'
  nsExec::ExecToLog 'taskkill /f /im "chamaai-novo.exe" /t'
  ; Espera 2 segundos para o Windows liberar as travas de arquivo
  Sleep 2000
!macroend
