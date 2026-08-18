<#
  사내 프록시가 TLS를 가로챌 때 쓰는 인증서 준비 스크립트.

      powershell -ExecutionPolicy Bypass -File fix-cert.ps1

  윈도우가 이미 신뢰하는 루트 인증서를 PEM으로 뽑아 Node/npm에 넘긴다.
  검증을 끄는 게 아니라 신뢰 목록을 넘겨주는 것이라 보안이 내려가지 않는다.

  주의: 환경변수는 이 창에서만 유효하다. 같은 창에서 이어서 npm 명령을 실행해야 한다.
        -Persist 를 주면 사용자 환경변수로 영구 저장한다.
#>
param([switch]$Persist)

$ErrorActionPreference = "Stop"
$pem = Join-Path $env:TEMP "corp-ca.pem"
$sb = [System.Text.StringBuilder]::new()
$seen = @{}
$count = 0

foreach ($store in @("Cert:\LocalMachine\Root", "Cert:\CurrentUser\Root", "Cert:\LocalMachine\CA")) {
    if (-not (Test-Path $store)) { continue }
    $certs = @(Get-ChildItem $store -ErrorAction SilentlyContinue)
    foreach ($c in $certs) {
        if ($seen.ContainsKey($c.Thumbprint)) { continue }
        $seen[$c.Thumbprint] = $true
        [void]$sb.AppendLine("-----BEGIN CERTIFICATE-----")
        [void]$sb.AppendLine([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))
        [void]$sb.AppendLine("-----END CERTIFICATE-----")
        $count++
    }
}

if ($count -eq 0) {
    Write-Host "인증서를 하나도 읽지 못했습니다." -ForegroundColor Red
    exit 1
}

[IO.File]::WriteAllText($pem, $sb.ToString())
$env:NODE_EXTRA_CA_CERTS = $pem
$env:npm_config_cafile = $pem

Write-Host "인증서 $count 개를 모았습니다" -ForegroundColor Green
Write-Host "  $pem"

if ($Persist) {
    [Environment]::SetEnvironmentVariable("NODE_EXTRA_CA_CERTS", $pem, "User")
    Write-Host "사용자 환경변수로 저장했습니다. 새 창에서도 적용됩니다." -ForegroundColor Green
} else {
    Write-Host "이 창에서만 적용됩니다. 이어서 같은 창에서 실행하세요:" -ForegroundColor Yellow
    Write-Host "  npm install"
}
