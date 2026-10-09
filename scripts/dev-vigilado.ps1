# Arranca `next dev` de una app del monorepo vigilando su memoria.
#
# El servidor de desarrollo llego a consumir varios GB sin control. Este script lo
# arranca con un tiempo de vida fijo, mide la memoria de sus procesos cada 5 s,
# lo corta si supera el limite y al terminar siempre mata todo lo que lanzo.
#
#   powershell -File scripts/dev-vigilado.ps1                      # dashboard en :3001, 10 min
#   powershell -File scripts/dev-vigilado.ps1 -App landing -Port 3000
#   powershell -File scripts/dev-vigilado.ps1 -Seconds 1800 -LimitMB 3000
#
# -SistemaUrl solo aplica a la landing: a donde reenvia las rutas del sistema.
#
# (Sin acentos a proposito: PowerShell 5.1 lee este archivo como ANSI.)
param(
  [ValidateSet('dashboard', 'landing')]
  [string]$App = 'dashboard',
  [int]$Port = 0,
  [int]$Seconds = 600,
  [int]$LimitMB = 2500,
  [string]$SistemaUrl = ''
)

if ($Port -eq 0) { $Port = if ($App -eq 'landing') { 3000 } else { 3001 } }

$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root "apps\$App"
$log = Join-Path $env:TEMP "setpoint-$App-dev.log"
if ($SistemaUrl) { $env:SISTEMA_URL = $SistemaUrl }

$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "cd /d `"$dir`" && npx next dev --port $Port > `"$log`" 2>&1" -PassThru -WindowStyle Hidden

# Solo se vigila y se mata lo que desciende del proceso lanzado aqui: otros
# procesos node del proyecto (tsc, eslint, otra app) no se tocan.
$conocidos = New-Object System.Collections.Generic.HashSet[int]
[void]$conocidos.Add([int]$proc.Id)

function Get-Tree {
  $todos = @(Get-CimInstance Win32_Process)
  do {
    $antes = $conocidos.Count
    foreach ($p in $todos) {
      if ($conocidos.Contains([int]$p.ParentProcessId)) { [void]$conocidos.Add([int]$p.ProcessId) }
    }
  } while ($conocidos.Count -gt $antes)
  $todos | Where-Object { $conocidos.Contains([int]$_.ProcessId) }
}

"servidor: http://localhost:$Port   registro: $log   limite: $LimitMB MB   duracion: $Seconds s"

$t0 = Get-Date
$max = 0
$ultimoAviso = -30
while (((Get-Date) - $t0).TotalSeconds -lt $Seconds) {
  Start-Sleep -Seconds 5
  $node = @(Get-Tree | Where-Object { $_.Name -eq 'node.exe' })
  $mb = [math]::Round((($node | Measure-Object WorkingSetSize -Sum).Sum) / 1MB)
  if ($mb -gt $max) { $max = $mb }
  $seg = [int]((Get-Date) - $t0).TotalSeconds
  if ($seg - $ultimoAviso -ge 30) {
    "{0,4}s  procesos={1,3}  memoria={2,5} MB" -f $seg, $node.Count, $mb
    $ultimoAviso = $seg
  }
  if ($mb -gt $LimitMB) { "LIMITE de memoria superado ($mb MB): se detiene el servidor"; break }
}

"memoria maxima: $max MB"
Get-Tree | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
"restantes tras limpiar: " + @(Get-Tree | Where-Object { $_.Name -eq 'node.exe' }).Count
