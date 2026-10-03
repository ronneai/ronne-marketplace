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

if ($script:Failures) { Write-Host "$($script:Failures) failed"; exit 1 }
Write-Host 'all passed'
