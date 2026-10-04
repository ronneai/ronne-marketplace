<#
Unit tests for install.ps1's helpers (feature 081), for Windows PowerShell 5.1 and PowerShell 7:
  powershell -NoProfile -File scripts/install/test-install.ps1
  pwsh -NoProfile -File scripts/install/test-install.ps1
The script is loaded without its last line, so Install-Ronne doesn't run.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'Test output.')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingPositionalParameters', '', Justification = 'Test-Case NAME EXPECTED ACTUAL reads as a table.')]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSUseDeclaredVarsMoreThanAssignments', 'RonneVersion', Justification = 'Read by Test-Release, loaded from install.ps1.')]
param()

$installer = Join-Path $PSScriptRoot 'install.ps1'
$text = [IO.File]::ReadAllText($installer) -replace '(?m)^Install-Ronne\s*$', ''
. ([scriptblock]::Create($text))

$script:Failures = 0
function Test-Case([string] $Name, $Expected, $Actual) {
  if ("$Expected" -ceq "$Actual") { Write-Host "ok   $Name" }
  else { Write-Host "FAIL ${Name}: expected [$Expected], got [$Actual]"; $script:Failures++ }
}

foreach ($c in @(
    @('0.4.0', '0.3.0', 1), @('0.3.0', '0.4.0', -1), @('1.0.0', '1.0.0', 0), @('1.0.0-rc.1', '1.0.0', -1),
    @('1.0.0', '1.0.0-rc.1', 1), @('1.0.0-rc.2', '1.0.0-rc.1', 1), @('0.10.0', '0.9.9', 1),
    @('5.5.0', '2.23.1', 1), @('2.23.0', '2.23.1', -1))) {
  Test-Case "Compare-RonneVersion $($c[0]) $($c[1])" $c[2] (Compare-RonneVersion $c[0] $c[1])
}

foreach ($d in 'ronne.example.com', 'localhost', 'a.b.co', 'xn--bcher-kva.example') { Test-Case "Test-Domain $d" $true (Test-Domain $d) }
foreach ($d in 'nodot', 'bad_domain!', '-x.example.com', 'example.com.', 'a b.com', '') { Test-Case "invalid domain [$d]" $false (Test-Domain $d) }
Test-Case 'Test-Email' $true (Test-Email 'ops@example.com')
Test-Case 'invalid email' $false (Test-Email 'not an email')

$script:Dir = Join-Path ([IO.Path]::GetTempPath()) "ronne-install-test-$PID"
New-Item -ItemType Directory -Force $script:Dir | Out-Null
try {
  [IO.File]::WriteAllText((Join-Path $script:Dir '.env'), "CUSTOM=1`nRONNE_PORT=7660`n")
  Write-EnvValue 'RONNE_PORT' ''
  Write-EnvValue 'RONNE_IMAGE' 'ronneai/marketplace:0.3.0'
  Write-EnvValue 'RONNE_DOMAIN' 'x.example.com'
  Write-EnvValue 'RONNE_DOMAIN' 'y.example.com'
  $bytes = [IO.File]::ReadAllBytes((Join-Path $script:Dir '.env'))
  Test-Case 'Write-EnvValue keeps other lines and replaces keys' "CUSTOM=1`nRONNE_IMAGE=ronneai/marketplace:0.3.0`nRONNE_DOMAIN=y.example.com`n" ([Text.Encoding]::UTF8.GetString($bytes))
  Test-Case '.env has no BOM' 67 $bytes[0]
  Test-Case 'Get-EnvValue' 'y.example.com' (Get-EnvValue 'RONNE_DOMAIN')
  Test-Case 'Get-EnvValue missing' '' (Get-EnvValue 'RONNE_TLS')
} finally { Remove-Item -Recurse -Force $script:Dir }

$RonneVersion = '@RONNE_VERSION@'
Test-Case "a repository copy isn't a release" $false (Test-Release)
$RonneVersion = '0.3.0'
Test-Case 'a written-in version is a release' $true (Test-Release)
Test-Case 'nothing listens on port 1' $true (Test-PortFree 1)
$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
$listener.Start()
try {
  $busyPort = ([System.Net.IPEndPoint] $listener.LocalEndpoint).Port
  Test-Case 'a port with a listener is busy' $false (Test-PortFree $busyPort)
} finally { $listener.Stop() }
$watch = [Diagnostics.Stopwatch]::StartNew()
$null = Test-PortFree 7659
Test-Case 'the port check answers within a second' $true ($watch.ElapsedMilliseconds -lt 1000)

# The whole script, without Docker on PATH: its message and exit 1.
$shell = (Get-Process -Id $PID).Path
$savedPath = $env:PATH
try {
  $env:PATH = ''
  $out = & $shell -NoProfile -File $installer -Yes -Dir (Join-Path ([IO.Path]::GetTempPath()) "ronne-x-$PID") 2>&1 | Out-String
  $code = $LASTEXITCODE
} finally { $env:PATH = $savedPath }
Test-Case 'no docker exits 1' 1 $code
Test-Case 'no docker says so' $true ($out -match "Docker isn't installed")

# --- The whole script with a fake docker and curl ---------------------------------------------------
# Each answers what the test sets in $env:FAKE_*, so the script runs end to end with no Docker and no
# network: .cmd files on Windows, shell scripts elsewhere. The fake curl answers the health check
# and hands everything else (the file:// download of compose.yaml) to the real curl. Ports are
# checked from the system's listeners, so a busy port is a real TcpListener.
$onWindows = $env:OS -eq 'Windows_NT'
$work = Join-Path ([IO.Path]::GetTempPath()) "ronne-install-fakes-$PID"
$fakes = Join-Path $work 'fakes'
New-Item -ItemType Directory -Force $fakes | Out-Null
$realCurl = if ($onWindows) { (Get-Command curl.exe | Select-Object -First 1).Source } else { (Get-Command curl -CommandType Application | Select-Object -First 1).Source }
if ($onWindows) {
  $fakeCurl = Join-Path $fakes 'curl.cmd'
  [IO.File]::WriteAllText((Join-Path $fakes 'docker.cmd'), @'
@echo off
if "%1"=="info" goto info
if "%1 %2"=="compose version" goto version
if "%1 %2"=="compose ls" (echo [] & exit /b 0)
if "%1 %2"=="compose ps" goto ps
if "%1 %2"=="compose up" exit /b 0
exit /b 1
:info
if "%FAKE_INFO%"=="ok" exit /b 0
echo %FAKE_INFO% 1>&2
exit /b 1
:version
if not defined FAKE_COMPOSE exit /b 1
echo %FAKE_COMPOSE%
exit /b 0
:ps
if defined FAKE_PS echo %FAKE_PS%
exit /b 0
'@)
  [IO.File]::WriteAllText($fakeCurl, "@echo off`r`necho %* | findstr /c:`"/api/health`" >nul && (<nul set /p =503) && exit /b 0`r`n`"$realCurl`" %*`r`n")
} else {
  $fakeCurl = Join-Path $fakes 'curl'
  [IO.File]::WriteAllText((Join-Path $fakes 'docker'), @'
#!/bin/sh
case "$1 ${2:-}" in
  "info "*) [ "$FAKE_INFO" = ok ] && exit 0; printf '%s\n' "$FAKE_INFO" >&2; exit 1 ;;
  "compose version") [ -n "$FAKE_COMPOSE" ] || exit 1; printf '%s\n' "$FAKE_COMPOSE" ;;
  "compose ls") printf '[]\n' ;;
  "compose ps") [ -z "$FAKE_PS" ] || printf '%s\n' "$FAKE_PS" ;;
  "compose up") exit 0 ;;
  *) exit 1 ;;
esac
'@)
  [IO.File]::WriteAllText($fakeCurl, "#!/bin/sh`ncase `"`$*`" in */api/health*) printf 503; exit 0 ;; esac`nexec '$realCurl' `"`$@`"`n")
  chmod +x (Join-Path $fakes 'docker') $fakeCurl
}
# file:///D:/a/compose.yaml on Windows, file:///repo/compose.yaml elsewhere ([Uri] gives nothing for a Unix path).
$composePath = (Resolve-Path (Join-Path $PSScriptRoot '../../compose.yaml')).Path -replace '\\', '/'
$composeUrl = if ($composePath.StartsWith('/')) { "file://$composePath" } else { "file:///$composePath" }

# Runs the installer with the fakes; returns its output and exit code.
function Invoke-Fake([string[]] $Arguments, [string] $Script = $installer, [switch] $KeepImage) {
  $saved = @{ PATH = $env:PATH; COMPOSE = $env:RONNE_INSTALL_COMPOSE_URL; IMAGE = $env:RONNE_INSTALL_IMAGE; CURL = $env:RONNE_INSTALL_CURL }
  try {
    $env:PATH = "$fakes$([IO.Path]::PathSeparator)$env:PATH"
    $env:RONNE_INSTALL_COMPOSE_URL = $composeUrl
    $env:RONNE_INSTALL_CURL = $fakeCurl
    $env:RONNE_INSTALL_IMAGE = if ($KeepImage) { $null } else { 'ronne-web:test' }
    $out = & $shell -NoProfile -File $Script -Yes @Arguments 2>&1 | Out-String
    return @{ Out = $out; Code = $LASTEXITCODE }
  } finally {
    $env:PATH = $saved.PATH; $env:RONNE_INSTALL_COMPOSE_URL = $saved.COMPOSE
    $env:RONNE_INSTALL_IMAGE = $saved.IMAGE; $env:RONNE_INSTALL_CURL = $saved.CURL
  }
}
function Get-EnvSummary([string] $Folder) {
  $path = Join-Path $Folder '.env'
  if (-not (Test-Path $path)) { return '(no .env)' }
  return ([IO.File]::ReadAllText($path).TrimEnd("`n") -split "`n" | Sort-Object) -join ' '
}
function Open-TestListener([int] $Port) {
  $l = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), $Port
  $l.Start(); return $l
}

try {
  $env:FAKE_INFO = 'error during connect: the Docker daemon is not running'; $env:FAKE_COMPOSE = '5.5.0'; $env:FAKE_PS = ''
  $r = Invoke-Fake @('-Mode', 'local', '-Dir', (Join-Path $work 'd1'))
  Test-Case 'a stopped daemon exits 1' 1 $r.Code
  Test-Case 'a stopped daemon says so' $true ($r.Out -match "it isn't running")

  $env:FAKE_INFO = 'ok'; $env:FAKE_COMPOSE = '2.20.3'
  $r = Invoke-Fake @('-Mode', 'local', '-Dir', (Join-Path $work 'd2'))
  Test-Case 'an old Compose exits 1' 1 $r.Code
  Test-Case 'an old Compose names the minimum' $true ($r.Out -match 'Compose 2\.20\.3 is too old: Ronne needs 2\.23\.1')

  $env:FAKE_COMPOSE = ''
  $r = Invoke-Fake @('-Mode', 'local', '-Dir', (Join-Path $work 'd3'))
  Test-Case 'no Compose v2 exits 1' 1 $r.Code
  Test-Case 'no Compose v2 says so' $true ($r.Out -match "Docker Compose v2 isn't available")

  # A fresh install on this computer, then a rerun while it's running.
  $env:FAKE_COMPOSE = '5.5.0'
  $fresh = Join-Path $work 'fresh'
  if ((Test-PortFree 7650) -and (Test-PortFree 7651)) {
    $r = Invoke-Fake @('-Mode', 'local', '-Dir', $fresh)
    Test-Case 'a fresh install succeeds' 0 $r.Code
    if ($r.Code -ne 0) { Write-Host $r.Out } # Shows why in the CI log.
    Test-Case 'a fresh install writes only the image' 'RONNE_IMAGE=ronne-web:test' (Get-EnvSummary $fresh)
    Test-Case 'a fresh install names the address' $true ($r.Out -match 'Ronne is running: http://localhost:7650')
    Test-Case 'a fresh install gets the proxy compose.yaml' $true ([bool] (Select-String -Path (Join-Path $fresh 'compose.yaml') -Pattern '^  proxy:' -Quiet))
    Test-Case 'a fresh install creates certs' $true (Test-Path (Join-Path $fresh 'certs'))
    $env:FAKE_PS = '0123456789ab'
    $hold = Open-TestListener 7650 # as if its own proxy held it
    try { $r = Invoke-Fake @('-Dir', $fresh) } finally { $hold.Stop() }
    $env:FAKE_PS = ''
    Test-Case 'a rerun keeps its own port' 'RONNE_IMAGE=ronne-web:test' (Get-EnvSummary $fresh)

    # A server with a domain, on the same folder.
    if ((Test-PortFree 80) -and (Test-PortFree 443)) {
      $r = Invoke-Fake @('-Mode', 'server', '-Domain', 'localhost', '-Email', 'ops@example.com', '-Dir', $fresh)
      Test-Case 'a domain succeeds' 0 $r.Code
      Test-Case 'a domain writes its lines' 'RONNE_ACME_EMAIL=ops@example.com RONNE_DOMAIN=localhost RONNE_HTTPS_PORT=443 RONNE_IMAGE=ronne-web:test RONNE_PORT=80' (Get-EnvSummary $fresh)
      $r = Invoke-Fake @('-Mode', 'local', '-Dir', $fresh)
      Test-Case 'back to this computer removes them' 'RONNE_IMAGE=ronne-web:test' (Get-EnvSummary $fresh)
    } else { Write-Host 'skip a domain: ports 80 or 443 are in use here' }
  } else { Write-Host 'skip the fresh install: ports 7650 or 7651 are in use here' }

  # Another program on 7650: the next free pair.
  $busy = Join-Path $work 'busy'
  $hold = Open-TestListener 7650
  try { $r = Invoke-Fake @('-Mode', 'local', '-Dir', $busy) } finally { $hold.Stop() }
  Test-Case 'a busy 7650 succeeds' 0 $r.Code
  Test-Case 'a busy 7650 moves to 7652' 'RONNE_HTTPS_PORT=7653 RONNE_IMAGE=ronne-web:test RONNE_PORT=7652' (Get-EnvSummary $busy)

  # Versions, with a copy of the script that has 0.2.0 written in.
  $released = Join-Path $work 'install-0.2.0.ps1'
  [IO.File]::WriteAllText($released, ([IO.File]::ReadAllText($installer) -replace '@RONNE_VERSION@', '0.2.0'))
  $versions = Join-Path $work 'versions'
  New-Item -ItemType Directory -Force $versions | Out-Null
  Copy-Item (Join-Path $PSScriptRoot '../../compose.yaml') (Join-Path $versions 'compose.yaml')
  [IO.File]::WriteAllText((Join-Path $versions '.env'), "RONNE_IMAGE=ronneai/marketplace:0.3.0`n")
  $r = Invoke-Fake @('-Mode', 'local', '-Dir', $versions) -Script $released -KeepImage
  Test-Case 'a downgrade exits 1' 1 $r.Code
  Test-Case 'a downgrade says why' $true ($r.Out -match 'has 0\.3\.0, newer than this script')
  [IO.File]::WriteAllText((Join-Path $versions '.env'), "RONNE_IMAGE=ronneai/marketplace:0.1.1`n")
  $r = Invoke-Fake @('-Mode', 'local', '-Dir', $versions) -Script $released -KeepImage
  Test-Case 'an upgrade succeeds' 0 $r.Code
  Test-Case 'an upgrade pins the new version' 'RONNE_IMAGE=ronneai/marketplace:0.2.0' (Get-EnvSummary $versions)

  # A legacy install: a compose.yaml from before the proxy, its stack running on 3000, no .env.
  $legacyDir = Join-Path $work 'legacy'
  New-Item -ItemType Directory -Force $legacyDir | Out-Null
  [IO.File]::WriteAllText((Join-Path $legacyDir 'compose.yaml'), "name: ronne-marketplace`nservices:`n  web:`n    ports:`n      - `"`${RONNE_PORT:-3000}:3000`"`n")
  $env:FAKE_PS = '0123456789ab'
  $hold = Open-TestListener 3000
  try { $r = Invoke-Fake @('-Mode', 'local', '-Dir', $legacyDir) } finally { $hold.Stop(); $env:FAKE_PS = '' }
  Test-Case 'a legacy rerun succeeds' 0 $r.Code
  Test-Case 'a legacy rerun keeps port 3000' 'RONNE_IMAGE=ronne-web:test RONNE_PORT=3000' (Get-EnvSummary $legacyDir)
  Test-Case 'a legacy rerun says so' $true ($r.Out -match 'keeping http://localhost:3000')
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  Remove-Item Env:FAKE_INFO, Env:FAKE_COMPOSE, Env:FAKE_PS -ErrorAction SilentlyContinue
}

if ($script:Failures) { Write-Host "$($script:Failures) failed"; exit 1 }
Write-Host 'all passed'
