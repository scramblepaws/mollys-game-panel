Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://127.0.0.1:8787"

Function Up()
  On Error Resume Next
  Dim x
  Set x = CreateObject("MSXML2.XMLHTTP")
  x.open "GET", url & "/api/health", False
  x.send
  Up = (Err.Number = 0 And x.Status = 200)
  On Error GoTo 0
End Function

If Not Up() Then
  sh.CurrentDirectory = folder
  sh.Run "cmd /c node server\backend.mjs", 0, False
  For i = 1 To 30
    WScript.Sleep 500
    If Up() Then Exit For
  Next
End If

On Error Resume Next
sh.Run "msedge.exe --app=" & url & " --window-size=1440,900", 1, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run url, 1, False
End If
