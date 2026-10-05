#Requires -Version 7
# `rmk-server service` end to end on Windows (feature 086): CI runs it on GitHub's Windows runner
# (server-package.yml), elevated, with the Windows bundle (084) unzipped where the installer (087)
# puts it: C:\Program Files\RonneAI\Marketplace, a path with a space. It changes the machine (a
# service, folders in ProgramData, a firewall rule): run it on a throwaway one.
# -Caddy: a caddy.exe (2.7 or later) that isn't on PATH yet.
param([Parameter(Mandatory)] [string] $Bundle, [Parameter(Mandatory)] [string] $Caddy)

$ErrorActionPreference = 'Stop'
$program = 'C:\Program Files\RonneAI\Marketplace'
$rmk = "$program\bin\rmk-server.cmd"
$root = 'C:\ProgramData\RonneAI\Marketplace'
$health = 'http://127.0.0.1:7650/api/health'
$usersSid = 'S-1-5-32-545'
$adminsSid = 'S-1-5-32-544'

function Step($message) { Write-Host "✓ $message" }
function Fail($message) { Write-Host "✗ $message"; exit 1 }
function Status($url) {
  try { (Invoke-WebRequest $url -SkipHttpErrorCheck -SkipCertificateCheck -TimeoutSec 5).StatusCode }
  catch { 0 }
}
# WaitFor URL CODE: up to 90 seconds.
function WaitFor($url, $code) {
  for ($i = 0; $i -lt 90; $i++) {
    if ((Status $url) -eq $code) { return }
    Start-Sleep 1
  }
  Fail "$url didn't answer $code (last: $(Status $url))"
}
# Runs a program, returning its output; its exit code is in $script:code.
function Run {
  # Each line as text: an error record's own wrapping would split the messages checked below.
  $output = & $args[0] @($args | Select-Object -Skip 1) 2>&1 | ForEach-Object { "$_" } | Out-String
  $script:code = $LASTEXITCODE
  $output
}
# Each rule of a path's permissions, as "SID:Rights", by SID (names are translated elsewhere).
function Rules($path) {
  (Get-Acl -LiteralPath $path).Access | ForEach-Object {
    "$($_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value):$($_.FileSystemRights)"
  }
}
function Owner($path) {
  (Get-Acl -LiteralPath $path).GetOwner([Security.Principal.SecurityIdentifier]).Value
}

# The bundle, unzipped straight into Program Files (so it has that folder's permissions).
New-Item -ItemType Directory -Force 'C:\Program Files\RonneAI' | Out-Null
Expand-Archive -LiteralPath $Bundle -DestinationPath 'C:\Program Files\RonneAI' -Force
$folder = Get-ChildItem 'C:\Program Files\RonneAI' -Directory -Filter 'rmk-server-*' | Select-Object -First 1
Rename-Item $folder.FullName 'Marketplace'

# The same bundle in a user's profile: the service's account couldn't read it, so it's refused.
$inProfile = Join-Path $env:USERPROFILE 'rmk-in-profile'
Copy-Item -Recurse $program $inProfile
$out = Run "$inProfile\bin\rmk-server.cmd" service install
if ($code -eq 0) { Fail "install from a user's profile succeeded" }
if ($out -notmatch "in a user's profile") { Fail "no profile message: $out" }
if (Test-Path "$root\data") { Fail "the refused install made folders" }
Remove-Item -Recurse -Force $inProfile
Step "a program in a user's profile: refused, nothing made"

$out = Run $rmk service status
if ($code -ne 4 -or $out -notmatch "isn't installed") { Fail "status before install ($code): $out" }
Step 'status before install: not installed (exit 4)'

# Install: the service, its virtual account, the folders' permissions, 503 before the setup.
$out = Run $rmk service install
if ($code -ne 0) { Fail "install failed ($code): $out" }
if ((Status $health) -ne 503) { Fail "not 503 before setup: $(Status $health)" }
$service = Get-CimInstance Win32_Service -Filter "Name='rmk-server'"
if ($service.State -ne 'Running') { Fail "the service is $($service.State)" }
if ($service.StartMode -ne 'Auto') { Fail "the service starts $($service.StartMode)" }
if ($service.StartName -ne 'NT SERVICE\rmk-server') { Fail "the service runs as $($service.StartName)" }
$node = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*--port 7650*' } | Select-Object -First 1
$who = Invoke-CimMethod -InputObject $node -MethodName GetOwner
if ("$($who.Domain)\$($who.User)" -ne 'NT SERVICE\rmk-server') { Fail "node runs as $($who.Domain)\$($who.User)" }
$listen = Get-NetTCPConnection -LocalPort 7650 -State Listen
if ($listen.LocalAddress -ne '127.0.0.1') { Fail "listening on $($listen.LocalAddress)" }
Step 'install: a service started at boot, as NT SERVICE\rmk-server, on 127.0.0.1:7650, 503 before setup'

# The SID install computed is the one Windows gives the account.
$serviceSid = ((sc.exe showsid rmk-server) -match 'SERVICE SID' | Select-Object -First 1) -replace '.*:\s*', ''
foreach ($path in "$root\data", "$root\.env", "$root\logs") {
  $rules = Rules $path
  if (-not ($rules -match "^$([regex]::Escape($serviceSid)):Modify")) { Fail "${path}: no Modify for $serviceSid ($($rules -join ', '))" }
  if ($rules -match "^$([regex]::Escape($serviceSid)):FullControl") { Fail "${path}: the account may change its permissions" }
  if ($rules -match "^${usersSid}:") { Fail "${path}: Users may read it ($($rules -join ', '))" }
  if (-not (Get-Acl -LiteralPath $path).AreAccessRulesProtected) { Fail "${path} inherits permissions" }
}
foreach ($path in 'C:\ProgramData\RonneAI', $root, "$root\data", "$root\.env", "$root\service") {
  if ((Owner $path) -ne $adminsSid) { Fail "$path is owned by $(Owner $path)" }
}
Step "the data, the settings and the logs: the account may change them ($serviceSid), not their permissions; not Users; the administrators own them"

$out = Run $rmk service status
if ($code -ne 0 -or $out -notmatch 'installed, running' -or $out -notmatch 'not set up yet') { Fail "status ($code): $out" }
Step 'status: installed, running, not set up yet'

# The setup, as the administrator, on the service's data: the service still reads its settings
# (rewritten in place) and writes its database (made by the administrator) afterwards.
$env:RONNE_ROOT_EMAIL = 'root@example.com'
$env:RONNE_ROOT_NAME = 'Root'
$env:RONNE_ROOT_PASSWORD = 'Correct-horse-42!'
$out = Run $rmk setup --yes
if ($code -ne 0) { Fail "setup failed ($code): $out" }
Remove-Item Env:RONNE_ROOT_PASSWORD
if (-not (Select-String -Quiet -LiteralPath "$root\.env" -Pattern '^DATABASE_URL=')) { Fail 'the settings file has no DATABASE_URL' }
if (-not ((Rules "$root\.env") -match "^$([regex]::Escape($serviceSid)):Modify")) { Fail 'the setup took the settings file from the service' }
$out = Run $rmk service restart
if ($code -ne 0) { Fail "restart failed: $out" }
WaitFor $health 200
$body = '{"email":"root@example.com","password":"Correct-horse-42!","name":"ci"}'
$token = Invoke-WebRequest -Method Post -ContentType 'application/json' -Body $body -SkipHttpErrorCheck `
  'http://127.0.0.1:7650/api/v1/auth/token'
if ($token.StatusCode -ne 201) { Fail "sign-in answered $($token.StatusCode)" }
$out = Run $rmk migrate
if ($out -notmatch '(?i)nothing to migrate') { Fail "migrate didn't reach the service's database: $out" }
Step "setup and migrate as the administrator; the service reads its settings, 200, and a sign-in writes a token"

# stop, start, restart; logs; a crash: Windows starts it again.
$out = Run $rmk service stop
if ((Status $health) -ne 0) { Fail 'still answering after stop' }
$out = Run $rmk service status
if ($code -ne 3) { Fail "status of a stopped service exited $code" }
$out = Run $rmk service start
WaitFor $health 200
$out = Run $rmk service restart
WaitFor $health 200
$log = "$root\logs\rmk-server-service.out.log"
if (-not (Select-String -Quiet -LiteralPath $log -Pattern 'Data folder: C:\\ProgramData')) { Fail "the log has no start: $(Get-Content -Tail 20 $log)" }
$logs = Start-Process -FilePath $rmk -ArgumentList 'service', 'logs' -NoNewWindow -PassThru `
  -RedirectStandardOutput "$env:RUNNER_TEMP\logs.txt"
Start-Sleep 5
taskkill /PID $logs.Id /T /F | Out-Null
if (-not (Select-String -Quiet -LiteralPath "$env:RUNNER_TEMP\logs.txt" -Pattern 'Data folder:')) { Fail "service logs: $(Get-Content -Raw "$env:RUNNER_TEMP\logs.txt")" }
$node = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*--port 7650*' } | Select-Object -First 1
Stop-Process -Id $node.ProcessId -Force
Start-Sleep 5
WaitFor $health 200
Step 'stop (status exit 3), start, restart, logs; after a crash Windows started it again'

# A taken port stops install before it changes anything.
$holder = [System.Net.Sockets.TcpListener]::new([ipaddress]'127.0.0.1', 7790)
$holder.Start()
$out = Run $rmk service install --port 7790
$holder.Stop()
if ($code -eq 0) { Fail 'install on a taken port succeeded' }
if ($out -notmatch 'port 7790 is in use on 127.0.0.1') { Fail "no port message: $out" }
if (-not (Select-String -Quiet -LiteralPath "$root\service\rmk-server-service.xml" -Pattern '--port 7650')) { Fail 'the XML changed' }
Step 'a taken port: refused'

# --host 0.0.0.0: a firewall rule for the port, on Private networks; gone when it's local again.
$out = Run $rmk service install --host 0.0.0.0
if ($code -ne 0) { Fail "install --host 0.0.0.0 failed: $out" }
WaitFor $health 200
$rule = Get-NetFirewallRule -DisplayName 'rmk-server'
if ($rule.Profile -ne 'Private' -or $rule.Direction -ne 'Inbound' -or $rule.Action -ne 'Allow') { Fail "the rule: $($rule.Profile) $($rule.Direction) $($rule.Action)" }
if ((Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule).LocalPort -ne '7650') { Fail 'the rule is for another port' }
$out = Run $rmk service install
WaitFor $health 200
if (Get-NetFirewallRule -DisplayName 'rmk-server' -ErrorAction SilentlyContinue) { Fail 'the rule stayed' }
Step '--host 0.0.0.0: an inbound rule for 7650 on Private networks; removed with 127.0.0.1'

# --domain: needs Caddy, a Caddy the proxy's account can run, then HTTPS through rmk-server-proxy.
$out = Run $rmk service install --domain localhost --tls internal
if ($code -eq 0 -or $out -notmatch 'needs Caddy') { Fail "--domain without Caddy ($code): $out" }
$mine = Join-Path $env:USERPROFILE 'caddy-bin'
New-Item -ItemType Directory -Force $mine | Out-Null
Copy-Item $Caddy "$mine\caddy.exe"
$path = $env:PATH
$env:PATH = "$mine;$path"
$out = Run $rmk service install --domain localhost --tls internal
if ($code -eq 0 -or $out -notmatch "can't run") { Fail "a Caddy in a user's profile wasn't refused ($code): $out" }
New-Item -ItemType Directory -Force 'C:\Program Files\Caddy' | Out-Null
Copy-Item $Caddy 'C:\Program Files\Caddy\caddy.exe'
$env:PATH = "C:\Program Files\Caddy;$path"
$out = Run $rmk service install --domain localhost --tls internal
if ($code -ne 0) { Fail "install --domain failed ($code): $out" }
WaitFor https://localhost/api/health 200
$redirect = Invoke-WebRequest http://localhost/api/health -MaximumRedirection 0 -SkipHttpErrorCheck -ErrorAction SilentlyContinue
if ($redirect.StatusCode -ne 308 -or "$($redirect.Headers.Location)" -ne 'https://localhost/api/health') {
  Fail "HTTP doesn't redirect to HTTPS: $($redirect.StatusCode) $($redirect.Headers.Location)"
}
$proxy = Get-CimInstance Win32_Service -Filter "Name='rmk-server-proxy'"
if ($proxy.State -ne 'Running' -or $proxy.StartName -ne 'NT SERVICE\rmk-server-proxy') { Fail "the proxy: $($proxy.State) as $($proxy.StartName)" }
$rule = Get-NetFirewallRule -DisplayName 'rmk-server-proxy'
if ($rule.Profile -ne 'Any') { Fail "the proxy's rule is for $($rule.Profile) networks" }
if (((Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule).LocalPort -join ',') -ne '80,443') { Fail "the proxy's rule is for other ports" }
if (-not (Select-String -Quiet -LiteralPath "$root\.env" -Pattern '^PUBLIC_URL=https://localhost$')) { Fail 'PUBLIC_URL is not https://localhost' }
$out = Run $rmk service status
if ($out -notmatch 'rmk-server-proxy, running') { Fail "status doesn't show the proxy: $out" }
Step '--domain localhost --tls internal: HTTPS through rmk-server-proxy as its own account, HTTP redirects, 80 and 443 open'

# Again without a domain: the proxy, its rule and its settings go; the data stays.
$out = Run $rmk service install
if ($code -ne 0) { Fail "install without --domain failed: $out" }
WaitFor $health 200
if (Get-Service rmk-server-proxy -ErrorAction SilentlyContinue) { Fail 'the proxy is still there' }
if (Get-NetFirewallRule -DisplayName 'rmk-server-proxy' -ErrorAction SilentlyContinue) { Fail "the proxy's rule stayed" }
if (Select-String -Quiet -LiteralPath "$root\.env" -Pattern '^PUBLIC_URL=https://') { Fail 'PUBLIC_URL stayed' }
Step 'without --domain again: the proxy and its rule removed, still set up'

# Uninstall keeps the data; --delete-data asks, then deletes it.
$out = Run $rmk service uninstall
if ($code -ne 0) { Fail "uninstall failed: $out" }
if (Get-Service rmk-server -ErrorAction SilentlyContinue) { Fail 'the service is still there' }
if (Test-Path "$root\service\rmk-server-service.xml") { Fail 'the XML stayed' }
if (-not (Test-Path "$root\data\ronne.db")) { Fail 'the database went' }
$out = 'data' | & $rmk service uninstall --delete-data 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or (Test-Path $root)) { Fail "uninstall --delete-data: $out" }
Step 'uninstall kept the data; --delete-data, confirmed, deleted it'
