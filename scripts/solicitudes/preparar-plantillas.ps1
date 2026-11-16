# Prepara la versión PDF de las solicitudes aprobadas (solo en un equipo con Microsoft Word; no se usa en los servidores).
# Por cada src/solicitudes/plantillas/solicitud-<ramo>.docx deja:
#   solicitud-<ramo>.pdf              el formato en blanco exportado por Word (mismo diseño)
#   solicitud-<ramo>.posiciones.json  posición de cada campo (página, x, y en puntos desde arriba a la izquierda y tamaño
#                                     de letra) en el mismo orden que src/solicitudes/docx.ts; las casillas, con el cuadrado
#                                     exacto del PDF (ajustar-casillas.mjs, requiere Node y npm install)
# El navegador escribe los datos sobre ese PDF (src/solicitudes/pdf.ts). Volver a correrlo si La Mundial cambia un formato.
# Uso (PowerShell, desde la raíz del repo):  powershell -ExecutionPolicy Bypass -File scripts\solicitudes\preparar-plantillas.ps1
#   Un solo formato:  ... -File scripts\solicitudes\preparar-plantillas.ps1 -Ramos rcp
# Tarda unos minutos por formato (Word calcula la posición de cada campo).
param([string[]]$Ramos = @('rcg', 'rcp', 'rce'))
$Ramos = @($Ramos | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$dir = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'src\solicitudes\plantillas'
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'solicitudes-cotizador'
New-Item -ItemType Directory -Force $tmp | Out-Null

# 1) PDF en blanco, cada uno en su propio Word recién abierto (exportar desde el proceso que mide posiciones, o con el
#    campo TIME actualizándose al imprimir, deja a Word colgado).
$exportar = Join-Path $tmp 'exportar.ps1'
Set-Content -LiteralPath $exportar -Encoding ASCII -Value @'
param([string]$entrada, [string]$salida)
$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
$w.Options.UpdateFieldsAtPrint = $false
try {
  $d = $w.Documents.Open($entrada, $false, $false, $false)
  $d.SaveAs2($salida, 17)
  [void]$d.Close([ref]0)
} finally { [void]$w.Quit() }
'@
foreach ($r in $Ramos) {
  $docx = Join-Path $tmp "solicitud-$r.docx"
  $pdf = Join-Path $tmp "solicitud-$r.pdf"
  Copy-Item -LiteralPath (Join-Path $dir "solicitud-$r.docx") -Destination $docx -Force
  & powershell -NoProfile -ExecutionPolicy Bypass -File $exportar -entrada $docx -salida $pdf
  if (-not (Test-Path -LiteralPath $pdf)) { throw "Word no exportó el PDF de $r" }
  Copy-Item -LiteralPath $pdf -Destination (Join-Path $dir "solicitud-$r.pdf") -Force
  "$r : PDF listo"
}

# 2) Posiciones de los campos, en solo lectura.
$inv = [System.Globalization.CultureInfo]::InvariantCulture
function Num($v) { [math]::Round([double]$v, 2).ToString($inv) }
function Posicion($rango) {
  $t = $rango.Font.Size; if ($t -gt 100 -or $t -le 0) { $t = 10 }
  "`"p`":$($rango.Information(3)),`"x`":$(Num $rango.Information(5)),`"y`":$(Num $rango.Information(6)),`"t`":$(Num $t)"
}
function Texto($s) { ($s -replace '[\r\n\x07]', '' -replace '\\', '\\' -replace '"', '\"').Trim() }

$w = New-Object -ComObject Word.Application
$w.Visible = $false
$w.DisplayAlerts = 0
try {
  foreach ($r in $Ramos) {
    $d = $w.Documents.Open((Join-Path $tmp "solicitud-$r.docx"), $false, $true, $false)
    $campos = @(); $i = 0
    foreach ($f in $d.FormFields) { $campos += "{`"n`":$i,$(Posicion $f.Range),`"v`":`"$(Texto $f.Result)`"}"; $i++ }
    $controles = @(); $i = 0
    foreach ($c in $d.ContentControls) { $controles += "{`"n`":$i,`"tipo`":$($c.Type),$(Posicion $c.Range),`"v`":`"$(Texto $c.Range.Text)`"}"; $i++ }
    $fechado = 'null'
    foreach ($fld in $d.Fields) {
      if ($fld.Code.Text -match '^\s*TIME') { $fechado = "{$(Posicion $fld.Result),`"v`":`"$(Texto $fld.Result.Text)`"}"; break }
    }
    [void]$d.Close([ref]0)
    $json = "{`"campos`":[`n$($campos -join ",`n")`n],`"controles`":[`n$($controles -join ",`n")`n],`"fechado`":$fechado}"
    [System.IO.File]::WriteAllText((Join-Path $dir "solicitud-$r.posiciones.json"), $json, (New-Object System.Text.UTF8Encoding $false))
    "$r : $($campos.Count) campos, $($controles.Count) controles"
  }
} finally { [void]$w.Quit() }

# 3) Casillas: posición exacta tomada de los cuadrados del PDF (Word la informa mal en párrafos centrados).
& node (Join-Path $PSScriptRoot 'ajustar-casillas.mjs') @Ramos
