# generate-assets.ps1 - erzeugt alle Inno-Setup-Design-Assets fuer Astraea Workspace Alpha 0.1
#
# DESIGN: dunkles Graphit/Indigo, feiner Gold-Akzent, ruhige Premium-Typografie.
# GLASS-Grundsaetze soweit Inno Setup sie zulaesst: eine Materialscheibe, feine
# Hairlines, ruhige Tiefe - KEINE Neon-/Cyberpunk-Optik, KEINE dekorativen
# Raster, keine Dot-Grids, keine Glow-Orbs.
#
# Technik: ausschliesslich PowerShell 5.1 + System.Drawing (GDI+). Keine neuen
# Dependencies. Alle Assets sind deterministisch reproduzierbar.
#
# Ausgaben (Default: <script>\assets):
#   wizard-image-{100,125,150,200,250}.bmp    WizardImageFile (Inno 6.6+ Flaechengroessen)
#   wizard-small-{100,125,150,200,250}.bmp    WizardSmallImageFile
#   wizard-back-{100,150,200,250}.png         WizardBackImageFile (dunkle Umgebung)
#   astraea-setup.ico / astraea-uninstall.ico  SetupIconFile / UninstallDisplayIcon
#   preview/contact-sheet.png                  Sichtpruefung der Assets
#   preview/wizard-simulation.png              Design-Simulation (KEINE Inno-Renderaufnahme)
#
# Aufruf:  powershell -NoProfile -ExecutionPolicy Bypass -File generate-assets.ps1
[CmdletBinding()]
param(
  [string]$OutputDir = '',
  [switch]$NoPreview
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $scriptDir = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  }
  $OutputDir = Join-Path $scriptDir 'assets'
}

# ---------------------------------------------------------------------------
# Palette (abgeleitet aus dem App-Designsystem: Graphit-Flaechen #07080d/#0b0d14/
# #131724; Textfarben #f5f7ff/#bdc5d8/#929bad) + ruhiges Indigo und Antik-Gold.
# ---------------------------------------------------------------------------
$P = @{
  Z0        = @(7, 8, 13)        # #07080D  Environment
  Z1        = @(11, 13, 20)      # #0B0D14  Workbench
  Z2        = @(19, 23, 36)      # #131724  Control
  Ink       = @(245, 247, 255)   # #F5F7FF  Primaertext (App-Token)
  InkSoft   = @(189, 197, 216)   # #BDC5D8  Sekundaertext
  InkMuted  = @(146, 155, 173)   # #929BAD  Muted
  Indigo    = @(122, 134, 200)   # #7A86C8  ruhiges Indigo
  IndigoDeep= @(78, 90, 150)     # #4E5A96
  IndigoLine= @(108, 120, 170)   # #6C78AA
  Gold      = @(200, 169, 106)   # #C8A96A  Antik-Gold (feiner Akzent)
  GoldLight = @(227, 200, 143)   # #E3C88F
  GoldDeep  = @(138, 111, 63)    # #8A6F3F
  White     = @(255, 255, 255)
}

function C([int[]]$rgb, [int]$alpha = 255) {
  return [System.Drawing.Color]::FromArgb($alpha, $rgb[0], $rgb[1], $rgb[2])
}

function New-Font([string[]]$candidates, [single]$pixels, [System.Drawing.FontStyle]$style = [System.Drawing.FontStyle]::Regular) {
  foreach ($name in $candidates) {
    try {
      $font = New-Object System.Drawing.Font($name, $pixels, $style, [System.Drawing.GraphicsUnit]::Pixel)
      if ($font.Name -eq $name -or $font.FontFamily.Name -eq $name) { return $font }
      $font.Dispose()
    } catch {
      # Fallback auf den naechsten Kandidaten
    }
  }
  return New-Object System.Drawing.Font('Segoe UI', $pixels, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-RoundedPath([single]$x, [single]$y, [single]$width, [single]$height, [single]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  if ($d -gt $width) { $d = $width }
  if ($d -gt $height) { $d = $height }
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $width - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $width - $d, $y + $height - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $height - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-RadialGlow([System.Drawing.Graphics]$g, [single]$cx, [single]$cy, [single]$radius, [System.Drawing.Color]$center) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = $center
  $brush.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::Transparent)
  $g.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()
}

function Draw-Line([System.Drawing.Graphics]$g, [single]$x1, [single]$y1, [single]$x2, [single]$y2, [System.Drawing.Color]$color, [single]$width = 1.0) {
  $pen = New-Object System.Drawing.Pen($color, $width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($pen, $x1, $y1, $x2, $y2)
  $pen.Dispose()
}

# Gezeichneter, gesperrter Text (Letter-Spacing); GenericTypographic vermeidet
# die zusaetzliche GDI+-Innenabstand-Verfaelschung.
function Measure-TrackedText([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [single]$tracking) {
  $format = [System.Drawing.StringFormat]::GenericTypographic
  $width = 0.0
  foreach ($ch in $text.ToCharArray()) {
    $piece = [string]$ch
    $size = $g.MeasureString($piece, $font, [System.Drawing.PointF]::new(0, 0), $format)
    $width += $size.Width + $tracking
  }
  if ($text.Length -gt 0) { $width -= $tracking }
  return $width
}

function Draw-TrackedText([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [System.Drawing.Brush]$brush, [single]$x, [single]$y, [single]$tracking) {
  $format = [System.Drawing.StringFormat]::GenericTypographic
  $cursor = $x
  foreach ($ch in $text.ToCharArray()) {
    $piece = [string]$ch
    $g.DrawString($piece, $font, $brush, $cursor, $y, $format)
    $size = $g.MeasureString($piece, $font, [System.Drawing.PointF]::new(0, 0), $format)
    $cursor += $size.Width + $tracking
  }
}

function Draw-TrackedCentered([System.Drawing.Graphics]$g, [string]$text, [System.Drawing.Font]$font, [System.Drawing.Brush]$brush, [single]$centerX, [single]$y, [single]$tracking) {
  $w = Measure-TrackedText $g $text $font $tracking
  Draw-TrackedText $g $text $font $brush ($centerX - $w / 2.0) $y $tracking
}

# Achtzackiger Kompassstern (Markenzeichen des Installers) + Gold-Kern.
function Draw-CompassStar([System.Drawing.Graphics]$g, [single]$cx, [single]$cy, [single]$outer, [single]$inner, [System.Drawing.Brush]$outerBrush, [System.Drawing.Brush]$goldBrush, [System.Drawing.Pen]$outlinePen) {
  $points = New-Object System.Collections.Generic.List[System.Drawing.PointF]
  for ($i = 0; $i -lt 8; $i++) {
    $angle = (-90.0 + $i * 45.0) * [Math]::PI / 180.0
    $radius = if ($i % 2 -eq 0) { $outer } else { $inner }
    $points.Add([System.Drawing.PointF]::new(
      [single]($cx + [Math]::Cos($angle) * $radius),
      [single]($cy + [Math]::Sin($angle) * $radius)))
  }
  $g.FillPolygon($outerBrush, $points.ToArray())
  if ($null -ne $outlinePen) { $g.DrawPolygon($outlinePen, $points.ToArray()) }
  # inneres Gold-Diamant (4 Zacken)
  if ($goldBrush -ne $null) {
    $diamond = New-Object System.Collections.Generic.List[System.Drawing.PointF]
    for ($i = 0; $i -lt 4; $i++) {
      $angle = (-90.0 + $i * 90.0) * [Math]::PI / 180.0
      $radius = $inner * 0.92
      $diamond.Add([System.Drawing.PointF]::new(
        [single]($cx + [Math]::Cos($angle) * $radius),
        [single]($cy + [Math]::Sin($angle) * $radius)))
    }
    $g.FillPolygon($goldBrush, $diamond.ToArray())
  }
}

# Materialscheibe (GLASS-Anmutung, dezent): Flaeche + Hairline + oberer Glanzbogen.
function Draw-GlassDisc([System.Drawing.Graphics]$g, [single]$cx, [single]$cy, [single]$radius) {
  $fill = New-Object System.Drawing.SolidBrush((C $P.White 8))
  $g.FillEllipse($fill, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
  $fill.Dispose()
  $border = New-Object System.Drawing.Pen((C $P.White 34), 1.0)
  $g.DrawEllipse($border, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2)
  $border.Dispose()
  $spec = New-Object System.Drawing.Pen((C $P.White 46), 1.2)
  $g.DrawArc($spec, $cx - $radius, $cy - $radius, $radius * 2, $radius * 2, 202, 62)
  $spec.Dispose()
}

# ---------------------------------------------------------------------------
# WizardImageFile: 202 x 386 @100% (Inno 6.6+ Flaeche), Designs in Design-Einheiten
# ---------------------------------------------------------------------------
function Draw-WizardImage([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $s = $width / 202.0
  $g.ScaleTransform($s, $s)

  # Z0-Umgebung: ruhiger Graphit-Verlauf, sehr weiche Indigo-Lichtzone oben rechts.
  $bgRect = [System.Drawing.RectangleF]::new(0, 0, 202, 386)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, (C $P.Z1), (C $P.Z0), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($bg, $bgRect)
  $bg.Dispose()
  Draw-RadialGlow $g 150 34 190 (C @(58, 68, 118) 88)
  Draw-RadialGlow $g 232 250 170 (C @(96, 80, 46) 26)

  # Marken-Geometrie: eine sehr feine Orbitlinie (kein Raster, keine Deko-Punkte).
  $orbitPen = New-Object System.Drawing.Pen((C $P.IndigoLine 24), 1.0)
  $g.DrawEllipse($orbitPen, -96, 216, 300, 300)
  $orbitPen.Dispose()
  $goldArc = New-Object System.Drawing.Pen((C $P.Gold 60), 1.0)
  $g.DrawArc($goldArc, 84, 300, 250, 250, 196, 54)
  $goldArc.Dispose()

  # Marke in Materialscheibe
  Draw-GlassDisc $g 46 58 34
  $starOuter = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.RectangleF]::new(24, 36, 44, 44), (C $P.Indigo), (C $P.IndigoDeep), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $goldBrush = New-Object System.Drawing.SolidBrush((C $P.Gold))
  $starPen = New-Object System.Drawing.Pen((C $P.Gold 120), 0.8)
  Draw-CompassStar $g 46 58 21 7.6 $starOuter $goldBrush $starPen
  $starOuter.Dispose(); $goldBrush.Dispose(); $starPen.Dispose()

  # Wortmarke
  $light = New-Font @('Segoe UI Light', 'Segoe UI') 22.0
  $semi = New-Font @('Segoe UI Semibold', 'Segoe UI') 6.2 ([System.Drawing.FontStyle]::Bold)
  $regular = New-Font @('Segoe UI', 'Segoe UI Semibold') 6.4
  $ink = New-Object System.Drawing.SolidBrush((C $P.Ink))
  $inkSoft = New-Object System.Drawing.SolidBrush((C $P.InkSoft))
  $inkMuted = New-Object System.Drawing.SolidBrush((C $P.InkMuted))
  $goldText = New-Object System.Drawing.SolidBrush((C $P.Gold))

  Draw-TrackedText $g 'ASTRAEA' $light $ink 22 101 4.4
  Draw-TrackedText $g 'WORKSPACE' $light $inkSoft 22 130 5.4

  # Gold-Hairline unter der Wortmarke, nach rechts auslaufend
  $lineRect = [System.Drawing.RectangleF]::new(22, 154, 108, 1)
  $lineBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($lineRect, (C $P.Gold 210), (C $P.Gold 0), [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
  $g.FillRectangle($lineBrush, $lineRect)
  $lineBrush.Dispose()

  Draw-TrackedText $g 'OPEN CORE' $semi $inkMuted 22 162 2.1
  $dividerX = 22 + (Measure-TrackedText $g 'OPEN CORE' $semi 2.1) + 6
  Draw-Line $g $dividerX 162.6 ($dividerX) 169.5 (C $P.IndigoLine 110) 0.8
  Draw-TrackedText $g 'ALPHA 0.1' $semi $goldText ($dividerX + 6) 162 2.1

  # Unterer Meta-Block: Zielplattform + Herausgeber (Informationsfunktion, keine Deko).
  Draw-Line $g 22 300 78 300 (C $P.IndigoLine 80) 0.8
  Draw-TrackedText $g 'WINDOWS 10/11  |  x64' $regular $inkMuted 22 309 1.35
  Draw-TrackedText $g 'VISIONGAIATECHNOLOGY' $semi $inkMuted 22 328 1.9
  $g.Dispose(); $ink.Dispose(); $inkSoft.Dispose(); $inkMuted.Dispose(); $goldText.Dispose()
  $light.Dispose(); $semi.Dispose(); $regular.Dispose()
  return $bitmap
}

# ---------------------------------------------------------------------------
# WizardSmallImageFile: quadratisch, 58x58 @100%
# ---------------------------------------------------------------------------
function Draw-WizardSmallImage([int]$size) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $s = $size / 58.0
  $g.ScaleTransform($s, $s)

  $bg = New-Object System.Drawing.SolidBrush((C $P.Z0))
  $g.FillRectangle($bg, 0, 0, 58, 58)
  $bg.Dispose()
  $plate = New-RoundedPath 0.5 0.5 57 57 13
  $plateBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.RectangleF]::new(0, 0, 58, 58), (C $P.Z2), (C $P.Z0), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillPath($plateBrush, $plate)
  $plateBrush.Dispose()
  $platePen = New-Object System.Drawing.Pen((C $P.IndigoLine 150), 1.0)
  $g.DrawPath($platePen, $plate)
  $platePen.Dispose()
  $plate.Dispose()

  $starOuter = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.RectangleF]::new(11, 11, 36, 36), (C $P.Indigo), (C $P.IndigoDeep), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $goldBrush = New-Object System.Drawing.SolidBrush((C $P.Gold))
  Draw-CompassStar $g 29 29 17.2 6.1 $starOuter $goldBrush $null
  $starOuter.Dispose(); $goldBrush.Dispose()
  $g.Dispose()
  return $bitmap
}

# ---------------------------------------------------------------------------
# WizardBackImageFile: dunkle Umgebung fuer die Inhaltsflaechen (PNG, dezent)
# ---------------------------------------------------------------------------
function Draw-WizardBackImage([int]$width, [int]$height) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $rect = [System.Drawing.RectangleF]::new(0, 0, $width, $height)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, (C $P.Z0), (C $P.Z1), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($bg, $rect)
  $bg.Dispose()
  # Grossflaechige, sehr weiche Lichtzonen - Materialtiefe statt Dekoration.
  Draw-RadialGlow $g ($width * 0.78) ($height * 0.46) ($width * 0.72) (C @(40, 48, 86) 44)
  Draw-RadialGlow $g ($width * 0.16) ($height * 1.02) ($width * 0.55) (C @(78, 66, 42) 20)
  # Eine feine Gold-Horizontlinie als Marken-Signatur (kein Raster).
  $pen = New-Object System.Drawing.Pen((C $P.Gold 52), 1.0)
  $g.DrawArc($pen, $width * 0.52, $height * 0.55, $width * 0.95, $height * 1.05, 196, 46)
  $pen.Dispose()
  $g.Dispose()
  return $bitmap
}

# ---------------------------------------------------------------------------
# Icons: Setup (Stern) und Uninstall (Ring + Minus), multi-size .ico (DIB)
# ---------------------------------------------------------------------------
function Draw-BrandIcon([int]$size, [string]$variant) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 256.0
  $g.ScaleTransform($s, $s)

  $plate = New-RoundedPath 8 8 240 240 52
  $plateBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    [System.Drawing.RectangleF]::new(8, 8, 240, 240), (C @(26, 31, 48)), (C $P.Z0), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillPath($plateBrush, $plate)
  $plateBrush.Dispose()
  $platePen = New-Object System.Drawing.Pen((C $P.IndigoLine 190), 3.0)
  $g.DrawPath($platePen, $plate)
  $platePen.Dispose()
  $highlight = New-Object System.Drawing.Pen((C $P.White 24), 2.0)
  $g.DrawArc($highlight, 18, 16, 220, 220, 200, 140)
  $highlight.Dispose()
  $plate.Dispose()

  if ($variant -eq 'uninstall') {
    $ring = New-Object System.Drawing.Pen((C $P.Indigo 230), 15.0)
    $g.DrawEllipse($ring, 64, 64, 128, 128)
    $ring.Dispose()
    $bar = New-Object System.Drawing.Drawing2D.GraphicsPath
    $bar.AddRectangle([System.Drawing.RectangleF]::new(88, 120, 80, 16))
    $barBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      [System.Drawing.RectangleF]::new(88, 120, 80, 16), (C $P.GoldLight), (C $P.Gold), [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
    $g.FillPath($barBrush, $bar)
    $barBrush.Dispose(); $bar.Dispose()
  } else {
    $orbit = New-Object System.Drawing.Pen((C $P.Gold 105), 2.0)
    $g.DrawArc($orbit, 48, 48, 160, 160, 196, 148)
    $orbit.Dispose()
    $starOuter = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      [System.Drawing.RectangleF]::new(48, 48, 160, 160), (C @(154, 165, 218)), (C $P.IndigoDeep), [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
    $goldBrush = New-Object System.Drawing.SolidBrush((C $P.Gold))
    $starPen = New-Object System.Drawing.Pen((C $P.GoldDeep 140), 2.0)
    Draw-CompassStar $g 128 128 84 30 $starOuter $goldBrush $starPen
    $starOuter.Dispose(); $goldBrush.Dispose(); $starPen.Dispose()
  }
  $g.Dispose()
  return $bitmap
}

function Get-IcoDibBytes([System.Drawing.Bitmap]$bitmap) {
  $w = $bitmap.Width
  $h = $bitmap.Height
  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $data = $bitmap.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $data.Stride
  $pixels = New-Object byte[] ($stride * $h)
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
  $bitmap.UnlockBits($data)

  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  # BITMAPINFOHEADER
  $bw.Write([UInt32]40)
  $bw.Write([Int32]$w)
  $bw.Write([Int32]($h * 2))
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]0)
  $bw.Write([UInt32]($w * $h * 4))
  $bw.Write([Int32]0)
  $bw.Write([Int32]0)
  $bw.Write([UInt32]0)
  $bw.Write([UInt32]0)
  # XOR-Bitmap (BGRA, von unten nach oben)
  for ($y = $h - 1; $y -ge 0; $y--) {
    $rowStart = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
      $i = $rowStart + $x * 4
      $bw.Write([byte]$pixels[$i + 0])
      $bw.Write([byte]$pixels[$i + 1])
      $bw.Write([byte]$pixels[$i + 2])
      $bw.Write([byte]$pixels[$i + 3])
    }
  }
  # AND-Maske (1 = transparent), Zeilen auf 4 Byte ausgerichtet, von unten nach oben
  $maskStride = [int]([Math]::Ceiling($w / 32.0) * 4)
  for ($y = $h - 1; $y -ge 0; $y--) {
    $row = New-Object byte[] $maskStride
    for ($x = 0; $x -lt $w; $x++) {
      $alpha = $pixels[$y * $stride + $x * 4 + 3]
      if ($alpha -lt 128) {
        $byteIndex = [int]([Math]::Floor($x / 8))
        $bit = [byte](1 -shl (7 - ($x % 8)))
        $row[$byteIndex] = [byte]($row[$byteIndex] -bor $bit)
      }
    }
    $bw.Write($row)
  }
  $bw.Flush()
  $bytes = $ms.ToArray()
  $bw.Dispose()
  $ms.Dispose()
  return $bytes
}

function Write-IcoFile([string]$path, [System.Drawing.Bitmap[]]$images) {
  $entries = New-Object System.Collections.Generic.List[object]
  $offset = 6 + 16 * $images.Count
  foreach ($image in $images) {
    $dib = Get-IcoDibBytes $image
    $entries.Add([pscustomobject]@{ Width = $image.Width; Height = $image.Height; Bytes = $dib; Offset = $offset })
    $offset += $dib.Length
  }
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $bw.Write([UInt16]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]$images.Count)
  foreach ($entry in $entries) {
    $dim = if ($entry.Width -ge 256) { 0 } else { $entry.Width }
    $bw.Write([byte]$dim)
    $bw.Write([byte]$dim)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([UInt16]1)
    $bw.Write([UInt16]32)
    $bw.Write([UInt32]$entry.Bytes.Length)
    $bw.Write([UInt32]$entry.Offset)
  }
  foreach ($entry in $entries) {
    $bw.Write([byte[]]$entry.Bytes)
  }
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($path, $ms.ToArray())
  $bw.Dispose()
  $ms.Dispose()
}

# ---------------------------------------------------------------------------
# Vorschaubilder fuer die visuelle Pruefung (keine echten Inno-Renderaufnahmen)
# ---------------------------------------------------------------------------
function Draw-SimulationPreview([string]$path, [System.Drawing.Bitmap]$wizardImage, [System.Drawing.Bitmap]$smallImage, [System.Drawing.Bitmap]$setupIcon) {
  $w = 1240; $h = 790
  $canvas = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear((C @(5, 6, 10)))

  $window = New-RoundedPath 40 50 1160 660 10
  $windowBrush = New-Object System.Drawing.SolidBrush((C @(20, 22, 29)))
  $g.FillPath($windowBrush, $window)
  $windowBrush.Dispose()
  $windowPen = New-Object System.Drawing.Pen((C @(38, 42, 54)), 1.0)
  $g.DrawPath($windowPen, $window)
  $windowPen.Dispose()
  $window.Dispose()

  # Titelleiste
  $title = New-RoundedPath 40 50 1160 38 10
  $titleBrush = New-Object System.Drawing.SolidBrush((C @(13, 15, 22)))
  $g.FillPath($titleBrush, $title)
  $titleBrush.Dispose()
  $title.Dispose()
  $g.FillRectangle((New-Object System.Drawing.SolidBrush((C @(13, 15, 22)))), 40, 72, 1160, 16) | Out-Null
  $titleFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 12.0
  $titleBrush2 = New-Object System.Drawing.SolidBrush((C @(174, 180, 196)))
  $g.DrawString('Astraea Workspace Alpha 0.1.0-alpha.1 - Setup', $titleFont, $titleBrush2, 62, 60)
  $titleBrush2.Dispose(); $titleFont.Dispose()
  foreach ($i in 0..2) {
    $dot = New-Object System.Drawing.SolidBrush((C @(70, 76, 92)))
    $g.FillEllipse($dot, 1138 + $i * 18, 62, 10, 10)
    $dot.Dispose()
  }

  # Linke Wizard-Bildflaeche (Design-Asset)
  $g.DrawImage($wizardImage, 58, 108, 202, 386)
  $frame = New-Object System.Drawing.Pen((C @(36, 40, 52)), 1.0)
  $g.DrawRectangle($frame, 58, 108, 202, 386)
  $frame.Dispose()

  # Kopfzeile der Inhaltsflaeche mit SmallImage
  $g.DrawImage($smallImage, 1100, 108, 58, 58)
  $pageTitleFont = New-Font @('Segoe UI Semibold', 'Segoe UI') 22.0 ([System.Drawing.FontStyle]::Bold)
  $pageDescFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 12.5
  $rowFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 12.0
  $labelFont = New-Font @('Segoe UI Semibold', 'Segoe UI') 13.5 ([System.Drawing.FontStyle]::Bold)
  $ink = New-Object System.Drawing.SolidBrush((C $P.Ink))
  $inkSoft = New-Object System.Drawing.SolidBrush((C $P.InkSoft))
  $inkMuted = New-Object System.Drawing.SolidBrush((C $P.InkMuted))
  $goldBrush = New-Object System.Drawing.SolidBrush((C $P.Gold))
  $g.DrawString('Systempruefung', $pageTitleFont, $ink, 300, 112)
  $g.DrawString('Pruefung der Laufzeitumgebungen vor der Installation', $pageDescFont, $inkSoft, 302, 148)
  Draw-Line $g 300 178 1150 178 (C @(52, 57, 72) 200) 1.0

  $rows = @(
    @('Windows 10/11, 64-bit', 'Windows 11 (Build 26100) - OK', 'ok'),
    @('Microsoft Edge WebView2 Runtime', '155.0.4283.60 - OK', 'ok'),
    @('Microsoft Visual C++ 2015-2022 (x64)', 'v14.51.36247.00 - OK', 'ok'),
    @('Dateizuordnungen (optional)', 'Auf der Aufgaben-Seite waehlbar', 'info'),
    @('Arbeitsdaten', 'Standardmaessig nur lokal, kein Cloud-Konto', 'info')
  )
  $y = 200
  foreach ($row in $rows) {
    $markColor = if ($row[2] -eq 'ok') { C @(75, 201, 139) } else { C $P.Gold }
    $dot = New-Object System.Drawing.SolidBrush($markColor)
    $g.FillEllipse($dot, 302, $y + 5, 8, 8)
    $dot.Dispose()
    $g.DrawString($row[0], $labelFont, $ink, 322, $y - 2)
    $g.DrawString($row[1], $rowFont, $inkSoft, 322, $y + 22)
    $y += 58
  }

  # Fertig-/Weiter-Buttonreihe in Inno-Dark-Anmutung
  $cancel = New-RoundedPath 946 654 88 32 4
  $cancelBrush = New-Object System.Drawing.SolidBrush((C @(36, 40, 51)))
  $g.FillPath($cancelBrush, $cancel)
  $cancelBrush.Dispose(); $cancel.Dispose()
  $next = New-RoundedPath 1044 654 106 32 4
  $nextBrush = New-Object System.Drawing.SolidBrush((C @(43, 75, 101)))
  $g.FillPath($nextBrush, $next)
  $nextBrush.Dispose(); $next.Dispose()
  $buttonFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 12.0
  $buttonInk = New-Object System.Drawing.SolidBrush((C @(236, 240, 248)))
  $g.DrawString('Abbrechen', $buttonFont, $buttonInk, 954, 662)
  $g.DrawString('Weiter', $buttonFont, $buttonInk, 1078, 662)
  $buttonInk.Dispose(); $buttonFont.Dispose()

  # Setup-Icon + Fusszeile
  $g.DrawImage($setupIcon, 58, 512, 64, 64)
  $smallFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 10.0
  $footFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 9.0
  $g.DrawString('Design-Simulation der Inno-Setup-Oberflaeche - generierte Assets, Astraea-Palette.', $smallFont, $inkMuted, 138, 530)
  $g.DrawString('KEINE echte Inno-Renderaufnahme. Massgeblich ist der Compile-/Install-Test.', $smallFont, $inkMuted, 138, 548)
  Draw-Line $g 40 740 1200 740 (C @(30, 34, 44)) 1.0
  $g.DrawString('Inno Setup 6.7+/7 | WizardStyle=modern dark hidebevels | WizardBackColor #07080D | WizardImageFile/SmallImageFile/BackImageFile', $footFont, $inkMuted, 40, 752)

  $g.Dispose()
  $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  $ink.Dispose(); $inkSoft.Dispose(); $inkMuted.Dispose(); $goldBrush.Dispose()
  $pageTitleFont.Dispose(); $pageDescFont.Dispose(); $rowFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose(); $footFont.Dispose()
}

function Draw-ContactSheet([string]$path, [System.Drawing.Bitmap]$wizardImage, [System.Drawing.Bitmap]$smallImage, [System.Drawing.Bitmap]$setupIcon, [System.Drawing.Bitmap]$uninstallIcon, [System.Drawing.Bitmap]$backImage) {
  $w = 1400; $h = 1000
  $canvas = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear((C @(6, 7, 11)))
  $titleFont = New-Font @('Segoe UI Semibold', 'Segoe UI') 18.0 ([System.Drawing.FontStyle]::Bold)
  $labelFont = New-Font @('Segoe UI', 'Segoe UI Semibold') 11.0
  $ink = New-Object System.Drawing.SolidBrush((C $P.Ink))
  $muted = New-Object System.Drawing.SolidBrush((C $P.InkMuted))
  $g.DrawString('Astraea Workspace Alpha 0.1 - Installer-Assets (Sichtpruefung)', $titleFont, $ink, 40, 28)
  $g.DrawString('Generiert mit PowerShell 5.1 + System.Drawing | Graphit/Indigo | feiner Gold-Akzent | keine Raster/Neon-Effekte', $labelFont, $muted, 40, 56)

  $g.DrawImage($wizardImage, 40, 96, 364, 695)
  $frame = New-Object System.Drawing.Pen((C @(36, 40, 52)))
  $g.DrawRectangle($frame, 40, 96, 364, 695)
  $frame.Dispose()
  $g.DrawString('WizardImageFile 202x386 (100 %) - 2x Vorschau', $labelFont, $muted, 40, 802)

  $g.DrawString('WizardSmallImageFile', $labelFont, $muted, 448, 96)
  $sizes = @(58, 77, 97, 124)
  $x = 448
  foreach ($size in $sizes) {
    $g.DrawImage($smallImage, $x, 124, $size, $size)
    $g.DrawString(('{0}px' -f $size), $labelFont, $muted, $x, 124 + $size + 6)
    $x += $size + 28
  }
  $g.DrawString('Setup / Uninstall Icon (aus .ico gerendert)', $labelFont, $muted, 448, 300)
  $g.DrawImage($setupIcon, 448, 328, 128, 128)
  $g.DrawString('astraea-setup.ico', $labelFont, $muted, 448, 462)
  $g.DrawImage($uninstallIcon, 616, 328, 128, 128)
  $g.DrawString('astraea-uninstall.ico', $labelFont, $muted, 616, 462)

  $g.DrawImage($backImage, 448, 520, 596, 432)
  $frame2 = New-Object System.Drawing.Pen((C @(36, 40, 52)))
  $g.DrawRectangle($frame2, 448, 520, 596, 432)
  $frame2.Dispose()
  $g.DrawString('WizardBackImageFile 596x432 (100 %) - dunkle Umgebung mit Indigo-Tiefe und feiner Gold-Signatur', $labelFont, $muted, 448, 960)

  $g.Dispose()
  $canvas.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
  $titleFont.Dispose(); $labelFont.Dispose(); $ink.Dispose(); $muted.Dispose()
}

# ---------------------------------------------------------------------------
# Hauptlauf
# ---------------------------------------------------------------------------
$assetsDir = [System.IO.Path]::GetFullPath($OutputDir)
$previewDir = Join-Path $assetsDir 'preview'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
if (-not $NoPreview) { New-Item -ItemType Directory -Force -Path $previewDir | Out-Null }

$wizardSizes = @(
  @{ Dpi = 100; Width = 202; Height = 386 },
  @{ Dpi = 125; Width = 269; Height = 515 },
  @{ Dpi = 150; Width = 336; Height = 643 },
  @{ Dpi = 200; Width = 430; Height = 824 },
  @{ Dpi = 250; Width = 534; Height = 1022 }
)
$smallSizes = @(
  @{ Dpi = 100; Size = 58 },
  @{ Dpi = 125; Size = 77 },
  @{ Dpi = 150; Size = 97 },
  @{ Dpi = 200; Size = 124 },
  @{ Dpi = 250; Size = 159 }
)
$backSizes = @(
  @{ Dpi = 100; Width = 596; Height = 432 },
  @{ Dpi = 150; Width = 994; Height = 720 },
  @{ Dpi = 200; Width = 1272; Height = 922 },
  @{ Dpi = 250; Width = 1630; Height = 1148 }
)
$iconSizes = @(16, 24, 32, 48, 64, 128, 256)

$summary = New-Object System.Collections.Generic.List[object]
foreach ($spec in $wizardSizes) {
  $file = Join-Path $assetsDir ('wizard-image-{0}.bmp' -f $spec.Dpi)
  $bmp = Draw-WizardImage $spec.Width $spec.Height
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  $summary.Add([pscustomobject]@{ File = $file; Width = $spec.Width; Height = $spec.Height })
}
foreach ($spec in $smallSizes) {
  $file = Join-Path $assetsDir ('wizard-small-{0}.bmp' -f $spec.Dpi)
  $bmp = Draw-WizardSmallImage $spec.Size
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
  $summary.Add([pscustomobject]@{ File = $file; Width = $spec.Size; Height = $spec.Size })
}
foreach ($spec in $backSizes) {
  $file = Join-Path $assetsDir ('wizard-back-{0}.png' -f $spec.Dpi)
  $bmp = Draw-WizardBackImage $spec.Width $spec.Height
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $summary.Add([pscustomobject]@{ File = $file; Width = $spec.Width; Height = $spec.Height })
}

$setupIcons = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
$uninstallIcons = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
foreach ($size in $iconSizes) {
  $setupIcons.Add((Draw-BrandIcon $size 'setup'))
  $uninstallIcons.Add((Draw-BrandIcon $size 'uninstall'))
}
$setupIco = Join-Path $assetsDir 'astraea-setup.ico'
$uninstallIco = Join-Path $assetsDir 'astraea-uninstall.ico'
Write-IcoFile $setupIco $setupIcons.ToArray()
Write-IcoFile $uninstallIco $uninstallIcons.ToArray()
$summary.Add([pscustomobject]@{ File = $setupIco; Width = 'multi'; Height = 'multi' })
$summary.Add([pscustomobject]@{ File = $uninstallIco; Width = 'multi'; Height = 'multi' })

if (-not $NoPreview) {
  $wizardPreview = Draw-WizardImage 202 386
  $smallPreview = Draw-WizardSmallImage 58
  $backPreview = Draw-WizardBackImage 596 432
  $setupPreview = $null
  $uninstallPreview = $null
  foreach ($bmp in $setupIcons) { if ($bmp.Width -eq 256) { $setupPreview = $bmp } }
  foreach ($bmp in $uninstallIcons) { if ($bmp.Width -eq 256) { $uninstallPreview = $bmp } }
  Draw-ContactSheet (Join-Path $previewDir 'contact-sheet.png') $wizardPreview $smallPreview $setupPreview $uninstallPreview $backPreview
  Draw-SimulationPreview (Join-Path $previewDir 'wizard-simulation.png') $wizardPreview $smallPreview $setupPreview
  $wizardPreview.Dispose(); $smallPreview.Dispose(); $backPreview.Dispose()
}
foreach ($bmp in $setupIcons) { $bmp.Dispose() }
foreach ($bmp in $uninstallIcons) { $bmp.Dispose() }

# Verifikation der erzeugten Dateien (Groessen/Header) - schlaegt hart fehl, statt still zu bleiben
$errors = New-Object System.Collections.Generic.List[string]
foreach ($entry in $summary) {
  if (-not (Test-Path $entry.File)) { $errors.Add("fehlt: $($entry.File)"); continue }
  if ($entry.Width -is [int]) {
    if ($entry.File.EndsWith('.bmp')) {
      $bytes = [System.IO.File]::ReadAllBytes($entry.File)
      if ($bytes.Length -lt 54 -or $bytes[0] -ne 0x42 -or $bytes[1] -ne 0x4D) { $errors.Add("kein BMP: $($entry.File)"); continue }
      $w = [BitConverter]::ToInt32($bytes, 18)
      $h = [BitConverter]::ToInt32($bytes, 22)
      if ($w -ne $entry.Width -or $h -ne $entry.Height) { $errors.Add(("BMP-Groesse falsch: {0} ({1}x{2} statt {3}x{4})" -f $entry.File, $w, $h, $entry.Width, $entry.Height)) }
    } elseif ($entry.File.EndsWith('.png')) {
      $bytes = [System.IO.File]::ReadAllBytes($entry.File)
      if ($bytes.Length -lt 24 -or $bytes[1] -ne 0x50 -or $bytes[2] -ne 0x4E -or $bytes[3] -ne 0x47) { $errors.Add("kein PNG: $($entry.File)"); continue }
      $w = ([int]$bytes[16] -shl 24) -bor ([int]$bytes[17] -shl 16) -bor ([int]$bytes[18] -shl 8) -bor [int]$bytes[19]
      $h = ([int]$bytes[20] -shl 24) -bor ([int]$bytes[21] -shl 16) -bor ([int]$bytes[22] -shl 8) -bor [int]$bytes[23]
      if ($w -ne $entry.Width -or $h -ne $entry.Height) { $errors.Add(("PNG-Groesse falsch: {0} ({1}x{2} statt {3}x{4})" -f $entry.File, $w, $h, $entry.Width, $entry.Height)) }
    }
  }
}
if ($errors.Count -gt 0) {
  foreach ($error in $errors) { Write-Error $error }
  exit 1
}

Write-Host "Astraea-Installer-Assets erzeugt in: $assetsDir"
foreach ($entry in $summary) {
  $item = Get-Item $entry.File
  Write-Host ("  {0,-32} {1,10:N0} B" -f $item.Name, $item.Length)
}
if (-not $NoPreview) { Write-Host "Vorschau: $previewDir" }
exit 0
