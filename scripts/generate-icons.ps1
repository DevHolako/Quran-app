#Requires -Version 5.1
<#
.SYNOPSIS
    Renders the app icon (open mushaf + Rub el Hizb 8-point star on emerald) to every
    density the project needs: Android mipmaps, the adaptive-icon vector layers, the
    in-app web asset and the Electron .ico/.png.

.DESCRIPTION
    The design is authored once, in a 108x108 "design unit" space, and reused for both
    the raster (GDI+) and the vector outputs, so the launcher icon and the adaptive icon
    layers can never drift apart.

    Sources of truth:
      $BookPath   - book outline, a flat command/coordinate list in the book's own unit box
      $PageLines  - horizontal text lines on each page
      $StarInner  - inner/outer radius ratio of the 8-point star (union of two squares)

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
#>

[CmdletBinding()]
param(
    # Only regenerate the adaptive-icon vector layers.
    [switch]$VectorsOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Res  = Join-Path $Root 'android\app\src\main\res'

# --------------------------------------------------------------------------- palette
$EmeraldTop    = [System.Drawing.Color]::FromArgb(255,  19, 138, 102)
$EmeraldBottom = [System.Drawing.Color]::FromArgb(255,   4,  34,  26)
$GoldLight     = [System.Drawing.Color]::FromArgb(255, 247, 219, 128)
$GoldDeep      = [System.Drawing.Color]::FromArgb(255, 190, 145,  30)
$StarRing      = [System.Drawing.Color]::FromArgb(235, 158, 118,  20)
$StarCream     = [System.Drawing.Color]::FromArgb(255, 255, 248, 226)
$FrameGold     = [System.Drawing.Color]::FromArgb(120, 201, 162,  39)
$LineGold      = [System.Drawing.Color]::FromArgb(190, 138, 101,  14)
$SeamGold      = [System.Drawing.Color]::FromArgb(120, 122,  88,  10)

# ------------------------------------------------------------------- design constants
# The adaptive icon canvas is 108dp and only the central 66dp circle is guaranteed to
# survive every launcher mask, so $BookWidth is sized to fit inside it.
$BookWidth     = 58.0
$BookUnitCx    = 0.5      # horizontal centre of the book unit box
$BookUnitCy    = 0.3975   # vertical centre of the book unit box
$StarRadius    = 9.6      # canvas units
$StarRingScale = 1.20
$LineThickness = 1.9      # canvas units
$StarInner     = 0.76537  # inner/outer radius of the 8-point star

# Book outline in its own unit box: command letter followed by x,y pairs.
$BookPath = @(
    'M', 0.5, 0.10,
    'C', 0.37, 0.055,  0.16, 0.075,  0.0, 0.16,
    'L', 0.0, 0.50,
    'C', 0.0, 0.585,   0.14, 0.675,  0.5, 0.74,
    'C', 0.86, 0.675,  1.0, 0.585,  1.0, 0.50,
    'L', 1.0, 0.16,
    'C', 0.84, 0.075,  0.63, 0.055,  0.5, 0.10,
    'Z'
)

# Page text lines, in the same unit box: x0,y0,x1,y1.
$PageLines = @(
    @(0.07, 0.275, 0.235, 0.250), @(0.07, 0.400, 0.235, 0.385), @(0.07, 0.525, 0.235, 0.520),
    @(0.93, 0.275, 0.765, 0.250), @(0.93, 0.400, 0.765, 0.385), @(0.93, 0.525, 0.765, 0.520)
)

$PageLineUnitV = @(0.115, 0.725)   # spine seam, top and bottom

# ------------------------------------------------------------------ path construction
function New-UnitTransform {
    param([double]$Cx, [double]$Cy, [double]$Width)
    return [PSCustomObject]@{
        Ox    = $Cx - $BookUnitCx * $Width
        Oy    = $Cy - $BookUnitCy * $Width
        Scale = $Width
    }
}

function Get-UnitPoint {
    param($T, [double]$U, [double]$V)
    return [System.Drawing.PointF]::new([float]($T.Ox + $U * $T.Scale), [float]($T.Oy + $V * $T.Scale))
}

function Get-UnitX { param($T, [double]$U) return $T.Ox + $U * $T.Scale }
function Get-UnitY { param($T, [double]$V) return $T.Oy + $V * $T.Scale }

# Walks a flat command list and returns @{ Cmd; Pts = PointF[] } entries already mapped
# into the target space. Shared by the raster and the vector writer so the two can never
# disagree about where a curve goes.
function Convert-UnitPath {
    param($Path, $T)
    $out = New-Object System.Collections.Generic.List[object]
    $i = 0
    while ($i -lt $Path.Count) {
        $cmd = [string]$Path[$i]
        $i++
        if ($cmd -eq 'Z') {
            $out.Add([PSCustomObject]@{ Cmd = 'Z'; Pts = @() })
            continue
        }
        $pts = New-Object System.Collections.Generic.List[System.Drawing.PointF]
        while ($i -lt $Path.Count -and $Path[$i] -isnot [string]) {
            $pts.Add((Get-UnitPoint $T ([double]$Path[$i]) ([double]$Path[$i + 1])))
            $i += 2
        }
        $out.Add([PSCustomObject]@{ Cmd = $cmd; Pts = $pts.ToArray() })
    }
    return $out
}

function New-BookPath {
    param($T)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.StartFigure()
    $cur = $null
    foreach ($seg in (Convert-UnitPath $BookPath $T)) {
        switch ($seg.Cmd) {
            'M' { $cur = $seg.Pts[0] }
            'L' { $p.AddLine($cur, $seg.Pts[0]); $cur = $seg.Pts[0] }
            'C' { $p.AddBezier($cur, $seg.Pts[0], $seg.Pts[1], $seg.Pts[2]); $cur = $seg.Pts[2] }
            'Z' { $p.CloseFigure() }
        }
    }
    return $p
}

function Get-StarAngles {
    $angles = New-Object 'System.Collections.Generic.List[double]'
    for ($i = 0; $i -lt 8; $i++) {
        $angles.Add($i * 45.0)
        $angles.Add(($i * 45.0) + 22.5)
    }
    return $angles.ToArray()
}

function New-StarPath {
    param([double]$Cx, [double]$Cy, [double]$R)
    $inner = $R * $StarInner
    $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    $angles = Get-StarAngles
    for ($k = 0; $k -lt $angles.Count; $k++) {
        $radius = if (($k % 2) -eq 0) { $R } else { $inner }
        $a = $angles[$k] * [Math]::PI / 180.0
        $pts.Add([System.Drawing.PointF]::new(
            [float]($Cx + $radius * [Math]::Cos($a)),
            [float]($Cy + $radius * [Math]::Sin($a))))
    }
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddPolygon($pts.ToArray())
    return $p
}

function New-CapsulePath {
    param([double]$X0, [double]$Y0, [double]$X1, [double]$Y1, [double]$R)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $dx = $X1 - $X0
    $dy = $Y1 - $Y0
    $len = [Math]::Sqrt($dx * $dx + $dy * $dy)
    if ($len -lt 0.0001) { return $p }
    $nx = -$dy / $len * $R * 0.55
    $ny = $dx / $len * $R * 0.55
    $p.StartFigure()
    $p.AddBezier(
        [System.Drawing.PointF]::new([float]$X0, [float]$Y0),
        [System.Drawing.PointF]::new([float]($X0 + $nx), [float]($Y0 + $ny)),
        [System.Drawing.PointF]::new([float]($X1 + $nx), [float]($Y1 + $ny)),
        [System.Drawing.PointF]::new([float]$X1, [float]$Y1))
    $p.AddBezier(
        [System.Drawing.PointF]::new([float]$X1, [float]$Y1),
        [System.Drawing.PointF]::new([float]($X1 - $nx), [float]($Y1 - $ny)),
        [System.Drawing.PointF]::new([float]($X0 - $nx), [float]($Y0 - $ny)),
        [System.Drawing.PointF]::new([float]$X0, [float]$Y0))
    $p.CloseFigure()
    return $p
}

# ------------------------------------------------------------------------- raster side
function New-GradientBrush {
    param([System.Drawing.RectangleF]$Rect, [System.Drawing.Color]$From, [System.Drawing.Color]$To, [double]$Angle = 90.0)
    return (New-Object System.Drawing.Drawing2D.LinearGradientBrush($Rect, $From, $To, [float]$Angle))
}

function New-RoundedRectPath {
    param([System.Drawing.RectangleF]$Rect, [double]$Radius)
    $d = $Radius * 2
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($Rect.X, $Rect.Y, $d, $d, 180, 90)
    $p.AddArc($Rect.Right - $d, $Rect.Y, $d, $d, 270, 90)
    $p.AddArc($Rect.Right - $d, $Rect.Bottom - $d, $d, $d, 0, 90)
    $p.AddArc($Rect.X, $Rect.Bottom - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function New-FramePath {
    param([System.Drawing.RectangleF]$Rect, [double]$Radius, [ValidateSet('Squircle', 'Circle')]$Shape)
    if ($Shape -eq 'Circle') {
        $p = New-Object System.Drawing.Drawing2D.GraphicsPath
        $p.AddEllipse($Rect)
        return $p
    }
    return (New-RoundedRectPath -Rect $Rect -Radius $Radius)
}

function Draw-Foreground {
    <# Draws book + star centred at (cx, cy) with the given book width. #>
    param(
        [System.Drawing.Graphics]$G,
        [double]$Cx, [double]$Cy, [double]$Width,
        [switch]$Transparent
    )
    $G.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $G.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $G.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $T = New-UnitTransform -Cx $Cx -Cy $Cy -Width $Width
    $starCy = $Cy + (0.45 - $BookUnitCy) * $Width
    $lineR  = $LineThickness * $Width / $BookWidth / 2

    # Soft drop shadow so the book separates from the background.
    if (-not $Transparent) {
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
        $path = New-BookPath (New-UnitTransform -Cx $Cx -Cy ($Cy + $Width * 0.035) -Width $Width)
        $G.FillPath($brush, $path)
        $path.Dispose(); $brush.Dispose()
    }

    # Page lines first, so the book edge stays crisp on top of them.
    $brush = New-Object System.Drawing.SolidBrush $LineGold
    foreach ($l in $PageLines) {
        $a = Get-UnitPoint $T $l[0] $l[1]
        $b = Get-UnitPoint $T $l[2] $l[3]
        $path = New-CapsulePath $a.X $a.Y $b.X $b.Y $lineR
        $G.FillPath($brush, $path)
        $path.Dispose()
    }
    $brush.Dispose()

    # Book body.
    $rect = New-Object System.Drawing.RectangleF `
        ([float]($Cx - $Width / 2)), ([float]($Cy - $Width * 0.40 / 2)), ([float]$Width), ([float]($Width * 0.40))
    $gold = New-GradientBrush -Rect $rect -From $GoldLight -To $GoldDeep -Angle 70
    $path = New-BookPath $T
    $G.FillPath($gold, $path)
    $path.Dispose(); $gold.Dispose()

    # Centre seam.
    $brush = New-Object System.Drawing.SolidBrush $SeamGold
    $path = New-CapsulePath (Get-UnitX $T 0.5) (Get-UnitY $T $PageLineUnitV[0]) (Get-UnitX $T 0.5) (Get-UnitY $T $PageLineUnitV[1]) ($lineR * 1.24)
    $G.FillPath($brush, $path)
    $path.Dispose(); $brush.Dispose()

    # Rub el Hizb: dark ring star, then the cream star on top.
    $path = New-StarPath -Cx $Cx -Cy $starCy -R ($StarRadius * $StarRingScale * $Width / $BookWidth)
    $brush = New-Object System.Drawing.SolidBrush $StarRing
    $G.FillPath($brush, $path)
    $path.Dispose(); $brush.Dispose()

    $path = New-StarPath -Cx $Cx -Cy $starCy -R ($StarRadius * $Width / $BookWidth)
    $brush = New-Object System.Drawing.SolidBrush $StarCream
    $G.FillPath($brush, $path)
    $path.Dispose(); $brush.Dispose()
}

function New-LegacyBitmap {
    param([int]$Size, [ValidateSet('Squircle', 'Circle')]$Shape = 'Squircle')
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $G = [System.Drawing.Graphics]::FromImage($bmp)
    $G.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $G.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $G.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $G.Clear([System.Drawing.Color]::Transparent)

    $full = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
    $frame = New-FramePath -Rect $full -Radius ($Size * 0.225) -Shape $Shape

    $bg = New-GradientBrush -Rect $full -From $EmeraldTop -To $EmeraldBottom -Angle 65
    $G.FillPath($bg, $frame)
    $bg.Dispose()

    # Radial sheen, clipped to the frame. PathGradientBrush is driven by a point ring,
    # so build that ring directly instead of asking a GraphicsPath for its points.
    $saved = $G.Save()
    $G.SetClip($frame)
    $sheenCx = $Size * 0.5
    $sheenCy = $Size * 0.20
    $sheenR  = $Size * 0.66
    $ring = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($s = 0; $s -lt 32; $s++) {
        $a = $s * 11.25 * [Math]::PI / 180.0
        $ring.Add([System.Drawing.PointF]::new(
            [float]($sheenCx + $sheenR * [Math]::Cos($a)),
            [float]($sheenCy + $sheenR * [Math]::Sin($a))))
    }
    # -ArgumentList with a leading comma keeps the ring as one Point[] argument instead
    # of letting PowerShell unroll it into 32 positional arguments.
    $sheen = New-Object System.Drawing.Drawing2D.PathGradientBrush -ArgumentList (,$ring.ToArray())
    $sheen.CenterColor = [System.Drawing.Color]::FromArgb(60, 255, 255, 255)
    $sheen.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
    $sheen.FocusScales = New-Object System.Drawing.PointF 0, 0
    $G.FillEllipse($sheen, [single]($sheenCx - $sheenR), [single]($sheenCy - $sheenR), [single]($sheenR * 2), [single]($sheenR * 2))
    $sheen.Dispose()
    $G.Restore($saved)

    Draw-Foreground -G $G -Cx ($Size / 2) -Cy ($Size / 2) -Width ($Size * 0.72)

    # Gold frame hairline, inset so a launcher mask never crops it.
    $inset = $Size * 0.045
    $borderRect = New-Object System.Drawing.RectangleF $inset, $inset, ($Size - 2 * $inset), ($Size - 2 * $inset)
    $border = New-FramePath -Rect $borderRect -Radius ($Size * 0.19) -Shape $Shape
    $pen = New-Object System.Drawing.Pen $FrameGold, ([float][Math]::Max(1.0, $Size * 0.018))
    $G.DrawPath($pen, $border)
    $pen.Dispose(); $border.Dispose(); $frame.Dispose()
    $G.Dispose()
    return $bmp
}

function New-ForegroundBitmap {
    param([int]$Size)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $G = [System.Drawing.Graphics]::FromImage($bmp)
    $G.Clear([System.Drawing.Color]::Transparent)
    Draw-Foreground -G $G -Cx ($Size / 2) -Cy ($Size / 2) -Width ($Size * $BookWidth / 108.0) -Transparent
    $G.Dispose()
    return $bmp
}

function Save-Png {
    param([System.Drawing.Bitmap]$Bmp, [string]$Path)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $Bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host ("  {0,-62} {1} x {2}" -f $Path.Replace($Root + '\', ''), $Bmp.Width, $Bmp.Height)
}

function Save-Ico {
    param([System.Drawing.Bitmap[]]$Bitmaps, [string]$Path)
    $entries = @()
    foreach ($b in $Bitmaps) {
        $ms = New-Object System.IO.MemoryStream
        $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $entries += , @{ Size = $b.Width; Data = $ms.ToArray() }
        $ms.Dispose()
    }
    $out = New-Object System.IO.MemoryStream
    $w = New-Object System.IO.BinaryWriter $out
    $w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$entries.Count)
    $offset = 6 + 16 * $entries.Count
    foreach ($e in $entries) {
        $dim = if ($e.Size -ge 256) { [byte]0 } else { [byte]$e.Size }
        $w.Write($dim); $w.Write($dim); $w.Write([byte]0); $w.Write([byte]0)
        $w.Write([uint16]1); $w.Write([uint16]32)
        $w.Write([uint32]$e.Data.Length); $w.Write([uint32]$offset)
        $offset += $e.Data.Length
    }
    foreach ($e in $entries) { $w.Write($e.Data) }
    $w.Flush()
    [System.IO.File]::WriteAllBytes($Path, $out.ToArray())
    $w.Dispose(); $out.Dispose()
    Write-Host ("  {0,-62} {1} sizes" -f $Path.Replace($Root + '\', ''), $entries.Count)
}

# ------------------------------------------------------------------------ vector side
# Android pathData and gradient attributes need '.' as the decimal separator. This
# machine's locale uses ',', which would silently produce garbage XML, so pin the
# invariant culture for every number that reaches a resource file.
function Format-Num {
    param([double]$Value, [int]$Precision = 2)
    $fmt = '0.' + ('0' * $Precision)
    $s = $Value.ToString($fmt, [System.Globalization.CultureInfo]::InvariantCulture)
    if ($s.StartsWith('-') -and [double]$s -eq 0) { $s = $s.Substring(1) }
    return $s
}

function Format-XY {
    param([double]$X, [double]$Y, [int]$Precision)
    return (Format-Num $X $Precision) + ',' + (Format-Num $Y $Precision)
}

function Get-PathData {
    <# Emits Android pathData for the book, using the same table as the raster. #>
    param($T, [int]$Precision = 2)
    $sb = New-Object System.Text.StringBuilder
    $cur = $null
    foreach ($seg in (Convert-UnitPath $BookPath $T)) {
        switch ($seg.Cmd) {
            'M' { $cur = $seg.Pts[0]; [void]$sb.Append('M' + (Format-XY $cur.X $cur.Y $Precision)) }
            'L' { [void]$sb.Append('L' + (Format-XY $seg.Pts[0].X $seg.Pts[0].Y $Precision)); $cur = $seg.Pts[0] }
            'C' {
                [void]$sb.Append('C' +
                    (Format-XY $seg.Pts[0].X $seg.Pts[0].Y $Precision) + ' ' +
                    (Format-XY $seg.Pts[1].X $seg.Pts[1].Y $Precision) + ' ' +
                    (Format-XY $seg.Pts[2].X $seg.Pts[2].Y $Precision))
                $cur = $seg.Pts[2]
            }
            'Z' { [void]$sb.Append('Z') }
        }
    }
    return $sb.ToString()
}

function Get-StarPathData {
    param([double]$Cx, [double]$Cy, [double]$R, [int]$Precision = 2)
    $inner = $R * $StarInner
    $sb = New-Object System.Text.StringBuilder
    $angles = Get-StarAngles
    for ($k = 0; $k -lt $angles.Count; $k++) {
        $radius = if (($k % 2) -eq 0) { $R } else { $inner }
        $a = $angles[$k] * [Math]::PI / 180.0
        [void]$sb.Append('L' + (Format-XY ($Cx + $radius * [Math]::Cos($a)) ($Cy + $radius * [Math]::Sin($a)) $Precision))
    }
    [void]$sb.Append('Z')
    return $sb.ToString()
}

function Get-CapsulePathData {
    param([double]$X0, [double]$Y0, [double]$X1, [double]$Y1, [double]$R, [int]$Precision = 2)
    $dx = $X1 - $X0
    $dy = $Y1 - $Y0
    $len = [Math]::Sqrt($dx * $dx + $dy * $dy)
    if ($len -lt 0.0001) { return '' }
    $nx = -$dy / $len * $R * 0.55
    $ny = $dx / $len * $R * 0.55
    $parts = New-Object System.Collections.Generic.List[string]
    $parts.Add('M' + (Format-XY $X0 $Y0 $Precision))
    $parts.Add('C' + (Format-XY ($X0 + $nx) ($Y0 + $ny) $Precision) + ' ' +
                     (Format-XY ($X1 + $nx) ($Y1 + $ny) $Precision) + ' ' +
                     (Format-XY $X1 $Y1 $Precision))
    $parts.Add('C' + (Format-XY ($X1 - $nx) ($Y1 - $ny) $Precision) + ' ' +
                     (Format-XY ($X0 - $nx) ($Y0 - $ny) $Precision) + ' ' +
                     (Format-XY $X0 $Y0 $Precision))
    $parts.Add('Z')
    return ($parts -join ' ')
}

function Write-VectorLayers {
    $cx = 54.0
    $cy = 54.0
    $T  = New-UnitTransform -Cx $cx -Cy $cy -Width $BookWidth
    $starCy = [Math]::Round($cy + (0.45 - $BookUnitCy) * $BookWidth, 2)
    $lineR  = [Math]::Round($LineThickness * $BookWidth / $BookWidth / 2, 2)

    $fg = @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generated by scripts/generate-icons.ps1 - do not edit by hand. -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:width="108dp"',
        '    android:height="108dp"',
        '    android:viewportWidth="108"',
        '    android:viewportHeight="108">'
    )
    foreach ($l in $PageLines) {
        $fg += '    <path android:fillColor="#8A650E" android:fillAlpha="0.75"'
        $fg += ('        android:pathData="{0}" />' -f (Get-CapsulePathData `
            (Get-UnitX $T $l[0]) (Get-UnitY $T $l[1]) (Get-UnitX $T $l[2]) (Get-UnitY $T $l[3]) $lineR))
    }
    $fg += '    <path android:fillColor="#7A580A" android:fillAlpha="0.5"'
    $fg += ('        android:pathData="{0}" />' -f (Get-CapsulePathData `
        (Get-UnitX $T 0.5) (Get-UnitY $T $PageLineUnitV[0]) (Get-UnitX $T 0.5) (Get-UnitY $T $PageLineUnitV[1]) `
        ([Math]::Round($lineR * 1.24, 2))))

    $fg += '    <path android:pathData="{0}">' -f (Get-PathData $T)
    $fg += '        <aapt:attr xmlns:aapt="http://schemas.android.com/aapt" name="android:fillColor">'
    $fg += '            <gradient android:type="linear"'
    $fg += ('                android:startX="{0}" android:startY="{1}"' -f `
        (Format-Num ($cx - $BookWidth / 2)), (Format-Num ($cy - $BookWidth * 0.20)))
    $fg += ('                android:endX="{0}" android:endY="{1}">' -f `
        (Format-Num ($cx + $BookWidth / 2)), (Format-Num ($cy + $BookWidth * 0.20)))
    $fg += '                <item android:color="#FFF7DB80" android:offset="0" />'
    $fg += '                <item android:color="#FFBE911E" android:offset="1" />'
    $fg += '            </gradient>'
    $fg += '        </aapt:attr>'
    $fg += '    </path>'

    $fg += '    <path android:fillColor="#9E7614" android:fillAlpha="0.92"'
    $fg += ('        android:pathData="{0}" />' -f (Get-StarPathData $cx $starCy ([Math]::Round($StarRadius * $StarRingScale, 2))))
    $fg += '    <path android:fillColor="#FFFFF8E2"'
    $fg += ('        android:pathData="{0}" />' -f (Get-StarPathData $cx $starCy $StarRadius))
    $fg += '</vector>'

    $bg = @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- Generated by scripts/generate-icons.ps1 - do not edit by hand. -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:width="108dp"',
        '    android:height="108dp"',
        '    android:viewportWidth="108"',
        '    android:viewportHeight="108">'
        '    <path android:pathData="M0,0h108v108h-108z">'
        '        <aapt:attr xmlns:aapt="http://schemas.android.com/aapt" name="android:fillColor">'
        '            <gradient android:type="linear" android:startX="8" android:startY="0" android:endX="100" android:endY="108">'
        '                <item android:color="#FF138A66" android:offset="0" />'
        '                <item android:color="#FF04221A" android:offset="1" />'
        '            </gradient>'
        '        </aapt:attr>'
        '    </path>'
        '    <path android:pathData="M0,0h108v108h-108z">'
        '        <aapt:attr xmlns:aapt="http://schemas.android.com/aapt" name="android:fillColor">'
        '            <gradient android:type="radial" android:centerX="54" android:centerY="22" android:gradientRadius="72">'
        '                <item android:color="#3CFFFFFF" android:offset="0" />'
        '                <item android:color="#00FFFFFF" android:offset="1" />'
        '            </gradient>'
        '        </aapt:attr>'
        '    </path>'
        '</vector>'
    )

    $dir = Join-Path $Res 'drawable'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText((Join-Path $dir 'ic_launcher_foreground.xml'), (($fg -join "`n") + "`n"), $enc)
    [System.IO.File]::WriteAllText((Join-Path $dir 'ic_launcher_background.xml'), (($bg -join "`n") + "`n"), $enc)
    Write-Host '  vector: ic_launcher_foreground.xml, ic_launcher_background.xml'
}

# --------------------------------------------------------------------------------- main
Write-Host 'Generating Quran app icons...'

# The stock template shipped a drawable-v24 copy of the vector; the new foreground lives
# in drawable/, and a -v24 variant would shadow it with the stale Android robot.
$stale = Join-Path $Res 'drawable-v24\ic_launcher_foreground.xml'
if (Test-Path -LiteralPath $stale) {
    Remove-Item -LiteralPath $stale -Force
    Write-Host '  removed: drawable-v24\ic_launcher_foreground.xml (stale template vector)'
}

Write-VectorLayers

if (-not $VectorsOnly) {
    $densities = [ordered]@{
        'mdpi'    = 48
        'hdpi'    = 72
        'xhdpi'   = 96
        'xxhdpi'  = 144
        'xxxhdpi' = 192
    }
    $adaptiveSizes = [ordered]@{
        'mdpi'    = 108
        'hdpi'    = 162
        'xhdpi'   = 216
        'xxhdpi'  = 324
        'xxxhdpi' = 432
    }

    foreach ($density in $densities.Keys) {
        $dir = Join-Path $Res "mipmap-$density"
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        $size = $densities[$density]

        $square = New-LegacyBitmap -Size $size -Shape 'Squircle'
        Save-Png -Bmp $square -Path (Join-Path $dir 'ic_launcher.png')
        $round = New-LegacyBitmap -Size $size -Shape 'Circle'
        Save-Png -Bmp $round -Path (Join-Path $dir 'ic_launcher_round.png')
        $fg = New-ForegroundBitmap -Size $adaptiveSizes[$density]
        Save-Png -Bmp $fg -Path (Join-Path $dir 'ic_launcher_foreground.png')

        $square.Dispose(); $round.Dispose(); $fg.Dispose()
    }

    # In-app brand mark / favicon.
    $web = New-LegacyBitmap -Size 256 -Shape 'Squircle'
    Save-Png -Bmp $web -Path (Join-Path $Root 'src\renderer\assets\icon.png')
    $web.Dispose()

    # Electron tray / window icon and installer icon.
    $icoSizes = @(16, 24, 32, 48, 64, 128, 256)
    $icoBitmaps = @(foreach ($s in $icoSizes) { New-LegacyBitmap -Size $s -Shape 'Squircle' })
    Save-Ico -Bitmaps $icoBitmaps -Path (Join-Path $Root 'build\icon.ico')
    $desktop = New-LegacyBitmap -Size 512 -Shape 'Squircle'
    Save-Png -Bmp $desktop -Path (Join-Path $Root 'build\icon.png')
    $desktop.Dispose()
    foreach ($b in $icoBitmaps) { $b.Dispose() }
}

Write-Host 'Done.'
