﻿# .ps1 파일 문법 검사. 맥/리눅스에서 pwsh로 돌려도 된다.
# 윈도우 스크립트를 검증 없이 올렸다가 파서 에러로 시간을 버린 적이 있어서 넣었다.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$bad = 0
# -Filter *.ps1 은 한글 파일명을 건너뛴다. 조용히 빠뜨리면 검사한 줄 알게 되므로 확장자로 직접 거른다.

foreach ($f in Get-ChildItem $root -Recurse -File | Where-Object { $_.Extension -eq ".ps1" }) {
    # BOM 확인 — Windows PowerShell 5.1은 BOM 없는 .ps1을 시스템 ANSI로 읽어 한글이 깨진다
    $head = [byte[]]::new(3)
    $fs = [IO.File]::OpenRead($f.FullName)
    [void]$fs.Read($head, 0, 3)
    $fs.Close()
    $hasBom = ($head[0] -eq 0xEF -and $head[1] -eq 0xBB -and $head[2] -eq 0xBF)

    $errors = $null; $tokens = $null
    [System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors) | Out-Null

    $name = $f.FullName.Substring($root.Length + 1)
    if ($errors) {
        Write-Host "  FAIL $name" -ForegroundColor Red
        foreach ($e in $errors) {
            Write-Host ("       {0}행 {1}열: {2}" -f $e.Extent.StartLineNumber, $e.Extent.StartColumnNumber, $e.Message)
        }
        $bad++
    } elseif (-not $hasBom) {
        Write-Host "  FAIL $name — UTF-8 BOM 없음 (PS 5.1에서 한글이 깨진다)" -ForegroundColor Red
        $bad++
    } else {
        Write-Host "  ok   $name" -ForegroundColor Green
    }
}

if ($bad) { Write-Host "`n$bad 건 실패" -ForegroundColor Red; exit 1 }
Write-Host "`nps1 점검 통과"
