; Windows installer for Plax, built with NSIS (scripts/package-windows.mjs runs makensis).
; Installs for the current user only (no admin password) into %LOCALAPPDATA%\Plax\app, adds Start menu
; and desktop shortcuts and an uninstaller. The library in %LOCALAPPDATA%\Plax\data is never removed.
Unicode true
!include "MUI2.nsh"

Name "Plax"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Plax\app"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Plax.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Open Plax now"
!define MUI_WELCOMEPAGE_TEXT "Plax is your personal design library. It runs only on this computer.$\r$\n$\r$\nPlax needs Node.js (the free LTS version from nodejs.org). The first time you open it, Plax installs what it needs, which takes a few minutes."
!define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\Plax"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Plax"
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*"
  File "/oname=plax.ico" "${ICON}"
  WriteUninstaller "$INSTDIR\Uninstall Plax.exe"
  CreateShortcut "$SMPROGRAMS\Plax.lnk" "$INSTDIR\Plax.bat" "" "$INSTDIR\plax.ico"
  CreateShortcut "$DESKTOP\Plax.lnk" "$INSTDIR\Plax.bat" "" "$INSTDIR\plax.ico"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "Plax"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\plax.ico"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall Plax.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Plax.lnk"
  Delete "$DESKTOP\Plax.lnk"
  DeleteRegKey HKCU "${UNINST}"
  ; Only the program folder: the library in ..\data stays.
  RMDir /r "$INSTDIR"
SectionEnd
