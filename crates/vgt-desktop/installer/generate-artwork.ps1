Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$outputDirectory = $PSScriptRoot

function Convert-HexColor([string]$hex, [int]$alpha = 255) {
  $value = $hex.TrimStart('#')
  return [System.Drawing.Color]::FromArgb(
    $alpha,
    [Convert]::ToInt32($value.Substring(0, 2), 16),
    [Convert]::ToInt32($value.Substring(2, 2), 16),
    [Convert]::ToInt32($value.Substring(4, 2), 16)
  )
}

function Draw-BrandMark(
  [System.Drawing.Graphics]$graphics,
  [single]$x,
  [single]$y,
  [single]$size
) {
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($x + $size * 0.50, $y),
    [System.Drawing.PointF]::new($x + $size * 0.65, $y + $size * 0.35),
    [System.Drawing.PointF]::new($x + $size, $y + $size * 0.50),
    [System.Drawing.PointF]::new($x + $size * 0.65, $y + $size * 0.65),
    [System.Drawing.PointF]::new($x + $size * 0.50, $y + $size),
    [System.Drawing.PointF]::new($x + $size * 0.35, $y + $size * 0.65),
    [System.Drawing.PointF]::new($x, $y + $size * 0.50),
    [System.Drawing.PointF]::new($x + $size * 0.35, $y + $size * 0.35)
  )
  $outer = [System.Drawing.SolidBrush]::new((Convert-HexColor '#7657FF'))
  $inner = [System.Drawing.SolidBrush]::new((Convert-HexColor '#35D6C2'))
  $graphics.FillPolygon($outer, $points)
  $innerPoints = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($x + $size * 0.50, $y + $size * 0.25),
    [System.Drawing.PointF]::new($x + $size * 0.75, $y + $size * 0.50),
    [System.Drawing.PointF]::new($x + $size * 0.50, $y + $size * 0.75),
    [System.Drawing.PointF]::new($x + $size * 0.25, $y + $size * 0.50)
  )
  $graphics.FillPolygon($inner, $innerPoints)
  $outer.Dispose()
  $inner.Dispose()
}

function New-InstallerArtwork([int]$width, [int]$height, [string]$kind) {
  $bitmap = [System.Drawing.Bitmap]::new(
    $width,
    $height,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bounds = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $bounds,
    (Convert-HexColor '#090D18'),
    (Convert-HexColor '#171B31'),
    [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
  )
  $graphics.FillRectangle($background, $bounds)

  $gridPen = [System.Drawing.Pen]::new((Convert-HexColor '#566081' 28), 1)
  for ($gridX = 0; $gridX -lt $width; $gridX += 20) {
    $graphics.DrawLine($gridPen, $gridX, 0, $gridX, $height)
  }
  for ($gridY = 0; $gridY -lt $height; $gridY += 20) {
    $graphics.DrawLine($gridPen, 0, $gridY, $width, $gridY)
  }

  if ($kind -eq 'header') {
    Draw-BrandMark $graphics 12 15 27
    $brandFont = [System.Drawing.Font]::new('Segoe UI Semibold', 11, [System.Drawing.FontStyle]::Bold)
    $subFont = [System.Drawing.Font]::new('Segoe UI', 6.5, [System.Drawing.FontStyle]::Regular)
    $brandBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $graphics.DrawString('ASTRAEA', $brandFont, $brandBrush, 48, 13)
    $headerMuted = [System.Drawing.SolidBrush]::new((Convert-HexColor '#B8C0D6'))
    $graphics.DrawString('OPEN CORE 0.1', $subFont, $headerMuted, 49, 31)
    $brandBrush.Dispose()
    $headerMuted.Dispose()
    $brandFont.Dispose()
    $subFont.Dispose()
  }
  else {
    $glow = [System.Drawing.Pen]::new((Convert-HexColor '#7657FF' 55), 1.5)
    $graphics.DrawEllipse($glow, 37, 188, 176, 176)
    $graphics.DrawEllipse($glow, 54, 205, 142, 142)
    Draw-BrandMark $graphics 62 48 40

    $brandFont = [System.Drawing.Font]::new('Segoe UI Semibold', 13, [System.Drawing.FontStyle]::Bold)
    $titleFont = [System.Drawing.Font]::new('Segoe UI Semibold', 8.5, [System.Drawing.FontStyle]::Bold)
    $bodyFont = [System.Drawing.Font]::new('Segoe UI', 7, [System.Drawing.FontStyle]::Regular)
    $accentBrush = [System.Drawing.SolidBrush]::new((Convert-HexColor '#35D6C2'))
    $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $mutedBrush = [System.Drawing.SolidBrush]::new((Convert-HexColor '#B8C0D6'))
    $graphics.DrawString('ASTRAEA', $brandFont, $whiteBrush, 15, 105)
    $graphics.DrawString('WORKSPACE', $titleFont, $accentBrush, 16, 127)
    $dividerPen = [System.Drawing.Pen]::new((Convert-HexColor '#7657FF'), 2)
    $graphics.DrawLine($dividerPen, 16, 153, 58, 153)
    $graphics.DrawString('A focused, local-first', $bodyFont, $mutedBrush, 16, 167)
    $graphics.DrawString('workspace for your work.', $bodyFont, $mutedBrush, 16, 179)
    $graphics.DrawString('OPEN CORE  Â·  ALPHA 0.1', $bodyFont, $mutedBrush, 16, 286)
    $dividerPen.Dispose()
    $brandFont.Dispose()
    $titleFont.Dispose()
    $bodyFont.Dispose()
    $accentBrush.Dispose()
    $whiteBrush.Dispose()
    $mutedBrush.Dispose()
  }

  $bitmap.Save((Join-Path $outputDirectory "artwork-$kind.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $graphics.Dispose()
  $background.Dispose()
  $gridPen.Dispose()
  if ($kind -eq 'sidebar') { $glow.Dispose() }
  $bitmap.Dispose()
}

New-InstallerArtwork 150 57 'header'
New-InstallerArtwork 164 314 'sidebar'

