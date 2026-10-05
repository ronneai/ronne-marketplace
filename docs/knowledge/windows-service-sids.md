# Windows service SIDs and folder permissions

Lessons from feature 086 (`packages/server/src/service/windows.ts`).

- **Ask Windows for a service's SID; don't compute it.** A virtual account's SID
  (`NT SERVICE\<name>`) is S-1-5-80 plus the SHA-1 of the upper-cased name, but hashing with
  SHA-1 in our code fails CodeQL (`js/weak-cryptographic-algorithm`, high). `sc.exe showsid
  <name>` prints it for any name, registered or not, so it can be set on folders before the
  service exists.
- **Give accounts by SID** (`*S-1-5-32-544` in `icacls`, `BA` in SDDL): names such as
  "Administrators" are translated on other languages' Windows.
- **Anyone may make folders in ProgramData.** Make each folder with its final permissions at once
  (`[IO.Directory]::CreateDirectory(path, DirectorySecurity)` in Windows PowerShell), and check it
  afterwards even when you just made it: `CreateDirectory` succeeds without a word when someone
  else made the folder in between. Never take one over (`takeown`, `icacls /reset /T`): a link
  inside would carry the change elsewhere.
- **Windows PowerShell with `-EncodedCommand` writes its errors to stderr as CLIXML**
  (`#< CLIXML`). Catch them in the script (`trap { "error`t$($_.Exception.Message)"; exit 1 }`)
  and read that line from standard output.
- **Windows PowerShell started from PowerShell 7 inherits pwsh's `PSModulePath`** and fails on its
  first module ("The member AuditToString is already present", from `Get-Acl`). Reset it first
  (`$env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')`) and
  prefer .NET to cmdlets (`[IO.DirectoryInfo]::new($p).GetAccessControl()`, `::new()` rather than
  `New-Object`), which load no module at all.
