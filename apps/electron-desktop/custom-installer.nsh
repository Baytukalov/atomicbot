!macro customInit
  nsExec::ExecToLog "taskkill /f /im AtomicBot.exe"
  Sleep 1000
!macroend

!macro customCheckAppRunning
  nsExec::Exec '"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq AtomicBot.exe" | "$SYSDIR\find.exe" "AtomicBot.exe"'
  Pop $R0

  ${if} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK doStopProcess
    Quit

    doStopProcess:
      DetailPrint "$(appClosing)"
      nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "AtomicBot.exe"'
      Sleep 1000

      nsExec::Exec '"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq AtomicBot.exe" | "$SYSDIR\find.exe" "AtomicBot.exe"'
      Pop $R0
      ${if} $R0 == 0
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY doStopProcess
        Quit
      ${endif}
  ${endif}

  ; Override SpiderBanner text to warn about long install times
  FindWindow $R1 "#32770" "" $HWNDPARENT
  ${if} $R1 != 0
    FindWindow $R1 "#32770" "" $HWNDPARENT $R1
    ${if} $R1 != 0
      GetDlgItem $R2 $R1 1000
      SendMessage $R2 ${WM_SETTEXT} 0 "STR:Installing, please wait... This may take up to 15 minutes."
    ${endif}
  ${endif}
!macroend

!macro customRemoveFiles
  ; Bypass electron-builder's atomic rename flow during updates.
  ; This avoids path growth in $PLUGINSDIR\old-install for deep .pnpm trees.
  SetOutPath $TEMP

  nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath ''$INSTDIR'' -Recurse -Force -ErrorAction Stop"'
  Pop $R0

  ${if} $R0 != 0
    ; Fallback for environments where PowerShell policy blocks command execution.
    RMDir /r "$INSTDIR"
  ${endif}
!macroend

!macro customUnInstall
  MessageBox MB_YESNO "Do you want to delete all application data?" /SD IDNO IDYES deleteData IDNO skipDelete
  deleteData:
    RMDir /r "$APPDATA\atomicbot-desktop"
  skipDelete:
!macroend
