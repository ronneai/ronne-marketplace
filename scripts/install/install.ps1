<#
Installs Ronne AI Marketplace with Docker, or upgrades an install (feature 081). Windows PowerShell
5.1 and PowerShell 7.

  irm https://www.ronne.ai/install.ps1 | iex
  (www.ronne.ai redirects to the latest release: https://github.com/ronneai/ronne-marketplace/releases/latest/download/install.ps1)
  & ([scriptblock]::Create((irm https://www.ronne.ai/install.ps1))) -Yes -Mode server -Domain ronne.example.com

It writes one folder (%USERPROFILE%\ronne-marketplace by default) with compose.yaml and .env,
starts Ronne and opens it in the browser. It changes nothing outside that folder. PowerShell parses
the whole script before running it, and everything runs from Install-Ronne, called on the last line,
so a download cut short runs nothing.

For tests only: RONNE_INSTALL_COMPOSE_URL (where compose.yaml comes from; file:// works),
RONNE_INSTALL_IMAGE (the image written to .env) and RONNE_INSTALL_CURL (the curl to run: a .cmd
can't stand in for curl.exe on PATH).
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSAvoidUsingWriteHost', '', Justification = 'An interactive installer talks to the console.')]
param(
  [switch] $Yes,
  [ValidateSet('', 'local', 'server')] [string] $Mode = '',
  [string] $Domain = '',
  [string] $Email = '',
  [string] $Dir = ''
)

# The release this script belongs to. release.yml writes it in; a copy from the repository has the
# placeholder, and then installs compose.yaml from main and the latest image.
$RonneVersion = '@RONNE_VERSION@'

$RepoRaw = 'https://raw.githubusercontent.com/ronneai/ronne-marketplace'
$ComposeMin = '2.23.1'
$ProjectName = 'ronne-marketplace'

function Exit-WithError([string] $Message) {
  Write-Host "Error: $Message" -ForegroundColor Red
  exit 1
}

function Test-Release { return -not $RonneVersion.StartsWith('@') }

# -1, 0 or 1 for two versions X.Y.Z[-pre]: numeric parts first, then a release beats its
# pre-releases, then pre-releases compare as text.
function Compare-RonneVersion([string] $A, [string] $B) {
  $pa = $A.Split('-', 2); $pb = $B.Split('-', 2)
  $x = $pa[0].Split('.'); $y = $pb[0].Split('.')
  for ($i = 0; $i -lt 3; $i++) {
    $xi = 0; $yi = 0
    if ($i -lt $x.Count) { [void][int]::TryParse($x[$i], [ref] $xi) }
    if ($i -lt $y.Count) { [void][int]::TryParse($y[$i], [ref] $yi) }
    if ($xi -lt $yi) { return -1 }
    if ($xi -gt $yi) { return 1 }
  }
  $prea = if ($pa.Count -gt 1) { $pa[1] } else { '' }
  $preb = if ($pb.Count -gt 1) { $pb[1] } else { '' }
  if ($prea -eq $preb) { return 0 }
  if ($prea -eq '') { return 1 }
  if ($preb -eq '') { return -1 }
  if ([string]::CompareOrdinal($prea, $preb) -lt 0) { return -1 }
  return 1
}

# --- Questions --------------------------------------------------------------------------------

function Read-Answer([string] $Question, [string] $Default) {
  if ($script:Yes) { return $Default }
  $prompt = if ($Default) { "$Question [$Default]" } else { $Question }
  $answer = Read-Host $prompt
  if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
  return $answer.Trim()
}

function Confirm-Step([string] $Question) {
  if ($script:Yes) { return $true }
  $answer = Read-Host "$Question [Y/n]"
  return ($answer -eq '' -or $answer -match '^(y|yes)$')
}

function Test-Domain([string] $Name) {
  if ($Name -eq 'localhost') { return $true }
  return $Name -match '^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$'
}

function Test-Email([string] $Address) { return $Address -match '^[^\s@]+@[^\s@]+\.[^\s@]+$' }

# --- Docker -----------------------------------------------------------------------------------

function Write-DockerLink {
  Write-Host 'Install Docker Desktop (https://docs.docker.com/desktop/setup/install/windows-install/), Rancher Desktop (https://rancherdesktop.io) or Podman Desktop (https://podman-desktop.io), start it, and run this again. Docker Desktop needs WSL 2.'
}

function Test-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker isn't installed: Ronne runs in Docker." -ForegroundColor Red
    Write-DockerLink
    exit 1
  }
  $null = docker info 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker is installed, but it isn't running (docker info failed). Start Docker Desktop and run this again." -ForegroundColor Red
    Write-DockerLink
    exit 1
  }
  $version = docker compose version --short 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $version) {
    Write-Host "Docker Compose v2 isn't available (docker compose version failed). With Podman, turn on Podman Desktop's Docker compatibility." -ForegroundColor Red
    Write-DockerLink
    exit 1
  }
  $version = "$version".Trim().TrimStart('v')
  if ((Compare-RonneVersion $version $ComposeMin) -lt 0) {
    Write-Host "Docker Compose $version is too old: Ronne needs $ComposeMin or later. Update Docker and run this again." -ForegroundColor Red
    Write-DockerLink
    exit 1
  }
}

# --- Ports ------------------------------------------------------------------------------------

# A port is free when nothing listens on it. Read from the system's list of listeners rather than by
# connecting: on Windows, a connection to a closed local port is retried for about 2 seconds before
# it's refused, so a short timeout would make every free port look busy.
function Test-PortFree([int] $Port) {
  $listeners = [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()
  return -not ($listeners | Where-Object { $_.Port -eq $Port })
}

# Ports this install's containers already publish don't count as busy on a rerun.
function Test-PortAvailable([int] $Port) {
  if ($script:Running -and ("$Port" -eq $script:OldPort -or "$Port" -eq $script:OldHttpsPort)) { return $true }
  return Test-PortFree $Port
}

# --- The folder and .env ----------------------------------------------------------------------

function Get-EnvValue([string] $Key) {
  $path = Join-Path $script:Dir '.env'
  if (-not (Test-Path $path)) { return '' }
  $value = ''
  foreach ($line in [IO.File]::ReadAllLines($path)) {
    if ($line.StartsWith("$Key=")) { $value = $line.Substring($Key.Length + 1) }
  }
  return $value
}

# Writes KEY=VALUE (an empty VALUE removes the line), keeping other lines, as UTF-8 without a BOM
# and with LF line ends: Compose reads a BOM as part of the first key.
function Write-EnvValue([string] $Key, [string] $Value) {
  $path = Join-Path $script:Dir '.env'
  $lines = @()
  if (Test-Path $path) { $lines = @([IO.File]::ReadAllLines($path) | Where-Object { -not $_.StartsWith("$Key=") }) }
  if ($Value) { $lines += "$Key=$Value" }
  $text = if ($lines.Count) { ($lines -join "`n") + "`n" } else { '' }
  [IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding $false))
}

function Invoke-Compose {
  Push-Location $script:Dir
  try { docker compose @args } finally { Pop-Location }
}

function Test-Folder {
  $compose = Join-Path $script:Dir 'compose.yaml'
  if (Test-Path $compose) {
    if (-not (Select-String -Path $compose -Pattern "^name: $ProjectName$" -Quiet)) {
      Exit-WithError "$($script:Dir) has a compose.yaml that isn't Ronne's. Choose another folder with -Dir."
    }
    $script:Installed = $true
  } elseif ((Test-Path $script:Dir) -and (Get-ChildItem -Force $script:Dir | Select-Object -First 1)) {
    Exit-WithError "$($script:Dir) exists and isn't a Ronne install. Choose another folder with -Dir."
  }
}

# Every install uses the project name ronne-marketplace, so one in another folder would be taken
# over (its containers and volumes). Stop instead.
function Test-OtherInstall {
  $json = docker compose ls --all --format json 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $json) { return }
  $project = @(($json | Out-String) | ConvertFrom-Json) | ForEach-Object { $_ } | Where-Object { $_.Name -eq $ProjectName } | Select-Object -First 1
  if (-not $project) { return }
  $other = Split-Path -Parent $project.ConfigFiles
  if ((Test-Path $script:Dir) -and ((Resolve-Path $script:Dir).Path -eq (Resolve-Path $other -ErrorAction SilentlyContinue).Path)) { return }
  Exit-WithError "Ronne AI Marketplace is already installed from $other (Docker project $ProjectName). Run this again with -Dir `"$other`" to upgrade it, or remove it first (cd there, then docker compose down)."
}

# --- DNS --------------------------------------------------------------------------------------

# A warning, not a stop: DNS may still be propagating, or the server may be behind NAT.
function Test-DnsRecord([string] $Name) {
  if ($Name -eq 'localhost') { return }
  try { $addresses = @([System.Net.Dns]::GetHostAddresses($Name) | ForEach-Object { $_.IPAddressToString }) }
  catch { $addresses = @() }
  if (-not $addresses.Count) {
    Write-Warning "$Name doesn't resolve yet. Add an A (and AAAA) record pointing at this server; until it resolves, no certificate can be issued."
    return
  }
  $mine = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
      ForEach-Object { $_.GetIPProperties().UnicastAddresses } | ForEach-Object { $_.Address.IPAddressToString.Split('%')[0] })
  foreach ($address in $addresses) { if ($mine -contains $address) { return } }
  Write-Warning "$Name resolves to $($addresses -join ', '), which isn't an address of this machine. That's fine behind a NAT or a cloud firewall that forwards ports 80 and 443 here; otherwise fix the DNS record."
}

# --- Waiting and opening ----------------------------------------------------------------------

function Get-Curl {
  if ($env:RONNE_INSTALL_CURL) { return $env:RONNE_INSTALL_CURL }
  if ($env:OS -eq 'Windows_NT') { return 'curl.exe' }
  return 'curl'
}

# Any answer through the proxy counts (503 setup_required is expected), except 502: web isn't up.
function Wait-Healthy {
  $curl = Get-Curl
  for ($i = 0; $i -lt 120; $i++) {
    if ($script:Mode -eq 'server') {
      $code = & $curl -sk -o $script:NullDevice -w '%{http_code}' --max-time 3 --resolve "$($script:Domain):$($script:HttpsPort):127.0.0.1" "https://$($script:Domain):$($script:HttpsPort)/api/health" 2>$null
    } else {
      $code = & $curl -s -o $script:NullDevice -w '%{http_code}' --max-time 3 "http://127.0.0.1:$($script:PortNumber)/api/health" 2>$null
    }
    if ($code -and $code -ne '000' -and $code -ne '502') { return $true }
    Start-Sleep -Seconds 1
  }
  return $false
}

# --- Main -------------------------------------------------------------------------------------

function Install-Ronne {
  $script:NullDevice = if ($env:OS -eq 'Windows_NT') { 'NUL' } else { '/dev/null' }
  if (-not $script:Dir) {
    $userHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
    $script:Dir = Join-Path $userHome 'ronne-marketplace'
  }
  # Windows PowerShell 5.1 may still default to TLS 1.0.
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  if (Test-Release) { Write-Host "Ronne AI Marketplace $RonneVersion`: install with Docker" }
  else { Write-Host 'Ronne AI Marketplace (a development copy of the script): install with Docker' }
  Test-Docker

  $script:Installed = $false
  Test-Folder
  Test-OtherInstall
  $script:OldPort = Get-EnvValue 'RONNE_PORT'
  $script:OldHttpsPort = Get-EnvValue 'RONNE_HTTPS_PORT'
  # A compose.yaml from before the proxy (080) published the app on 3000.
  $legacy = $script:Installed -and (Select-String -Path (Join-Path $script:Dir 'compose.yaml') -Pattern 'RONNE_PORT:-3000' -SimpleMatch -Quiet)
  $script:Running = $false
  $containers = Invoke-Compose ps -q 2>$null
  if ($script:Installed -and $containers) {
    $script:Running = $true
    if (-not $script:OldPort -and $legacy) { $script:OldPort = '3000' }
    if (-not $script:OldPort) { $script:OldPort = '7650' }
    if (-not $script:OldHttpsPort) { $script:OldHttpsPort = '7651' }
  }

  # The version: an upgrade asks first, a downgrade is refused.
  $image = $env:RONNE_INSTALL_IMAGE
  if (-not $image -and (Test-Release)) { $image = "ronneai/marketplace:$RonneVersion" }
  $oldImage = Get-EnvValue 'RONNE_IMAGE'
  if ($script:Installed -and (Test-Release) -and -not $env:RONNE_INSTALL_IMAGE) {
    if ($oldImage -match '^ronneai/marketplace:(\d.*)$') {
      $oldVersion = $Matches[1]
      switch (Compare-RonneVersion $RonneVersion $oldVersion) {
        -1 { Exit-WithError "$($script:Dir) has $oldVersion, newer than this script's $RonneVersion. Use the newer script." }
        1 { if (-not (Confirm-Step "Upgrade $oldVersion -> $RonneVersion?")) { Exit-WithError 'Nothing changed.' } }
        0 { Write-Host "Already on $RonneVersion`: checking the settings and starting it." }
      }
    } elseif (-not $oldImage) {
      if (-not (Confirm-Step "Pin this install to $RonneVersion (it follows latest now)?")) { Exit-WithError 'Nothing changed.' }
    } elseif (-not (Confirm-Step "Replace the image $oldImage with ronneai/marketplace:$RonneVersion?")) {
      Exit-WithError 'Nothing changed.'
    }
  }

  # Where it runs. The answers in .env are the defaults.
  $oldDomain = Get-EnvValue 'RONNE_DOMAIN'
  if (-not $script:Mode) {
    $defaultChoice = if ($oldDomain -or ($script:Yes -and $script:Domain)) { '2' } else { '1' }
    while ($true) {
      if (-not $script:Yes) { Write-Host 'Where will Ronne run?  1) This computer  2) A server with a domain' }
      $choice = Read-Answer 'Choose 1 or 2' $defaultChoice
      if ($choice -eq '1') { $script:Mode = 'local'; break }
      if ($choice -eq '2') { $script:Mode = 'server'; break }
      if ($script:Yes) { Exit-WithError 'Choose 1 or 2.' }
    }
  }

  if ($script:Mode -eq 'server') {
    while ($true) {
      if (-not $script:Domain) { $script:Domain = Read-Answer 'The domain (such as ronne.example.com)' $oldDomain }
      if (Test-Domain $script:Domain) { break }
      if ($script:Yes) { Exit-WithError "-Mode server needs a valid -Domain, not `"$($script:Domain)`"." }
      Write-Host "`"$($script:Domain)`" isn't a domain name."
      $script:Domain = ''
    }
    if (-not $script:Email) {
      $script:Email = Read-Answer 'An email for expiry notices from the certificate authority (optional)' (Get-EnvValue 'RONNE_ACME_EMAIL')
    }
    if ($script:Email -and -not (Test-Email $script:Email)) { Exit-WithError "`"$($script:Email)`" isn't an email address." }
    Test-DnsRecord $script:Domain
    foreach ($p in 80, 443) {
      if (Test-PortAvailable $p) { continue }
      Write-Host "Port $p is in use on this machine, probably by a web server (IIS, nginx...)." -ForegroundColor Red
      Write-Host 'Ronne needs 80 and 443 to get a certificate. Either stop that server, or run Ronne behind it:'
      Write-Host 'run this again as "This computer", then follow "Behind your own web server" in https://github.com/ronneai/ronne-marketplace/blob/main/docs/runbooks/install.md'
      exit 1
    }
    $port = '80'
    $script:HttpsPort = '443'
  } else {
    # This computer: 7650 and 7651, or the next free pair up to 7662.
    $port = if ($script:OldPort) { $script:OldPort } else { '7650' }
    $script:HttpsPort = if ($script:OldHttpsPort) { $script:OldHttpsPort } else { '7651' }
    if ($legacy -and -not (Get-EnvValue 'RONNE_PORT')) {
      $port = '3000'
      Write-Host 'This install was on port 3000 before the proxy: keeping http://localhost:3000 (RONNE_PORT=3000 in .env).'
    }
    if ($port -in '80', '443') { $port = '7650'; $script:HttpsPort = '7651' } # Moving from a server to this computer.
    if ($port -notmatch ':' -and -not ((Test-PortAvailable ([int] $port)) -and (Test-PortAvailable ([int] $script:HttpsPort)))) {
      $busy = $port
      $port = ''
      for ($candidate = 7650; $candidate -le 7661; $candidate += 2) {
        if ((Test-PortAvailable $candidate) -and (Test-PortAvailable ($candidate + 1))) {
          $port = "$candidate"; $script:HttpsPort = "$($candidate + 1)"; break
        }
      }
      if (-not $port) { Exit-WithError "Ports 7650 to 7662 are all in use. Free one, or set RONNE_PORT and RONNE_HTTPS_PORT in $($script:Dir)\.env." }
      if ($script:Yes) { Write-Host "Port $busy is in use: using $port (and $($script:HttpsPort) for HTTPS) instead." }
      elseif (-not (Confirm-Step "Port $busy is in use. Use $port (and $($script:HttpsPort) for HTTPS) instead?")) { Exit-WithError "Free port $busy and run this again." }
    }
  }
  $script:PortNumber = $port.Split(':')[-1]

  # Write the folder: compose.yaml from this release, .env with the answers.
  New-Item -ItemType Directory -Force -Path $script:Dir, (Join-Path $script:Dir 'certs') | Out-Null
  $composeUrl = if ($env:RONNE_INSTALL_COMPOSE_URL) { $env:RONNE_INSTALL_COMPOSE_URL }
  elseif (Test-Release) { "$RepoRaw/v$RonneVersion/compose.yaml" }
  else { "$RepoRaw/main/compose.yaml" }
  $tmp = Join-Path $script:Dir "compose.yaml.tmp.$PID"
  & (Get-Curl) -fsSL $composeUrl -o $tmp
  if ($LASTEXITCODE -ne 0) { Exit-WithError "Couldn't download $composeUrl." }
  if (-not (Select-String -Path $tmp -Pattern "^name: $ProjectName$" -Quiet)) { Remove-Item $tmp; Exit-WithError "$composeUrl isn't Ronne's compose.yaml." }
  Move-Item -Force $tmp (Join-Path $script:Dir 'compose.yaml')

  if ($image) { Write-EnvValue 'RONNE_IMAGE' $image }
  if ($script:Mode -eq 'server') {
    Write-EnvValue 'RONNE_DOMAIN' $script:Domain
    Write-EnvValue 'RONNE_PORT' '80'
    Write-EnvValue 'RONNE_HTTPS_PORT' '443'
    Write-EnvValue 'RONNE_ACME_EMAIL' $script:Email
  } else {
    Write-EnvValue 'RONNE_DOMAIN' ''
    Write-EnvValue 'RONNE_ACME_EMAIL' ''
    Write-EnvValue 'RONNE_PORT' $(if ($port -eq '7650') { '' } else { $port })
    Write-EnvValue 'RONNE_HTTPS_PORT' $(if ($script:HttpsPort -eq '7651') { '' } else { $script:HttpsPort })
  }
  Write-Host "Wrote $(Join-Path $script:Dir 'compose.yaml') and $(Join-Path $script:Dir '.env')"

  # Start, wait, open.
  Write-Host 'Starting Ronne (the first start downloads the images)...'
  Invoke-Compose up -d --quiet-pull
  if ($LASTEXITCODE -ne 0) { Exit-WithError "docker compose up failed. See the messages above, and: cd $($script:Dir); docker compose logs" }

  $url = if ($script:Mode -eq 'server') { "https://$($script:Domain)" } else { "http://localhost:$($script:PortNumber)" }
  $publicUrl = Get-EnvValue 'PUBLIC_URL'
  if ($publicUrl) { $url = $publicUrl }

  if (Wait-Healthy) {
    Write-Host ''
    Write-Host "Ronne AI Marketplace is running: $url" -ForegroundColor Green
    if (-not $script:Installed) { Write-Host 'Open it now and finish the setup: until then, anyone who can reach it can set it up.' }
    if (-not $script:Yes -and $env:OS -eq 'Windows_NT') { Start-Process $url }
  } else {
    Write-Host "Ronne didn't answer within 120 seconds. See: cd $($script:Dir); docker compose logs" -ForegroundColor Red
    if ($script:Mode -eq 'server') { Write-Host 'With a domain, check that its DNS points here and that ports 80 and 443 are open.' }
    exit 1
  }
  Write-Host "Folder: $($script:Dir). To upgrade later, run the install command again."
}

$script:Yes = $Yes.IsPresent; $script:Mode = $Mode; $script:Domain = $Domain; $script:Email = $Email; $script:Dir = $Dir
Install-Ronne
