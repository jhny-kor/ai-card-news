<#
  카드뉴스 생성기 — 윈도우 빌드 + 반입 패키지 생성

  인터넷이 되는 윈도우 PC에서 실행한다. 결과물 exe 하나만 폐쇄망으로 반입하면 된다.

      powershell -ExecutionPolicy Bypass -File build-win.ps1

  옵션:
      -Clean          node_modules와 dist를 지우고 처음부터
      -OutDir <경로>  반입 패키지를 복사할 위치 (기본: .\반입)
      -SkipCert       사내 인증서 자동 처리를 건너뛴다
      -Insecure       TLS 검증을 끈다. 최후의 수단 (아래 설명 참고)

  사내망에서 "self-signed certificate in certificate chain" 이 나면:
      이 스크립트가 윈도우 신뢰 저장소의 루트 인증서를 PEM으로 뽑아
      Node/npm/electron-builder에 물려준다. 별도 작업이 필요 없다.
#>
param(
  [switch]$Clean,
  [string]$OutDir = "반입",
  [switch]$SkipCert,
  [switch]$Insecure
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Info($msg) { Write-Host "    $msg" }
function Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`n실패: $msg" -ForegroundColor Red; exit 1 }

# --- 1. 사전 확인 -----------------------------------------------------------
Step 1 "빌드 환경 확인"
try { $nodeV = (& node --version) } catch { Fail "Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치하세요." }
try { $npmV = (& npm --version) } catch { Fail "npm을 찾을 수 없습니다." }
Info "node $nodeV / npm $npmV"

$major = [int]($nodeV -replace '^v(\d+).*', '$1')
if ($major -lt 18) { Fail "Node.js 18 이상이 필요합니다 (현재 $nodeV)." }

# --- 2. 사내 인증서 ---------------------------------------------------------
# 사내 프록시가 TLS를 가로채면 Node가 인증서 체인을 못 믿는다.
# 윈도우는 이미 그 루트를 신뢰하고 있으므로(브라우저는 되는 이유), 저장소에서 뽑아 Node에 넘긴다.
# 검증을 끄는 게 아니라 신뢰 목록을 넘겨주는 것이라 보안이 내려가지 않는다.
Step 2 "사내 인증서 확인"
if ($Insecure) {
  Warn "-Insecure: TLS 검증을 끕니다. 이 창에서만 적용되고 영구 설정은 바꾸지 않습니다."
  Warn "가로채는 쪽이 누구인지 확인할 수 없게 됩니다. 다른 방법이 모두 실패했을 때만 쓰세요."
  $env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
  $env:npm_config_strict_ssl = "false"
} elseif ($SkipCert) {
  Info "-SkipCert: 건너뜁니다."
} else {
  $pem = Join-Path $env:TEMP "cardnews-win-ca.pem"
  $sb = [System.Text.StringBuilder]::new()
  $seen = @{}
  $count = 0
  foreach ($store in @("Cert:\LocalMachine\Root", "Cert:\CurrentUser\Root", "Cert:\LocalMachine\CA")) {
    if (-not (Test-Path $store)) { continue }
    foreach ($c in Get-ChildItem $store -ErrorAction SilentlyContinue) {
      if ($seen.ContainsKey($c.Thumbprint)) { continue }   # 저장소끼리 많이 겹친다
      $seen[$c.Thumbprint] = $true
      [void]$sb.AppendLine("-----BEGIN CERTIFICATE-----")
      [void]$sb.AppendLine([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))
      [void]$sb.AppendLine("-----END CERTIFICATE-----")
      $count++
    }
  }
  if ($count -gt 0) {
    [IO.File]::WriteAllText($pem, $sb.ToString())
    # NODE_EXTRA_CA_CERTS 하나로 electron 다운로드와 electron-builder 리소스까지 전부 덮인다.
    $env:NODE_EXTRA_CA_CERTS = $pem
    $env:npm_config_cafile = $pem
    Info "윈도우 신뢰 저장소에서 인증서 $count 개를 넘겨줍니다"
    Info $pem
  } else {
    Warn "인증서를 하나도 못 읽었습니다. 그대로 진행합니다."
  }
}

try { $null = Invoke-WebRequest -Uri "https://registry.npmjs.org" -UseBasicParsing -TimeoutSec 10 }
catch { Fail "npm 레지스트리에 접속할 수 없습니다. 이 스크립트는 인터넷이 되는 PC에서 실행해야 합니다." }
Info "네트워크 정상"

# --- 3. 정리 ----------------------------------------------------------------
Step 3 "이전 결과물 삭제"
function Remove-Tree($path) {
  if (-not (Test-Path $path)) { return }
  # 탐색기·백신이 파일을 잡고 있으면 EPERM이 난다. 몇 번 다시 시도한다.
  for ($i = 1; $i -le 3; $i++) {
    try { Remove-Item $path -Recurse -Force -ErrorAction Stop; Info "$path 삭제"; return }
    catch { Start-Sleep -Seconds 2 }
  }
  Warn "$path 를 못 지웠습니다. 탐색기에서 폴더를 닫고 백신 실시간 검사를 잠시 끈 뒤 다시 실행하세요."
}
if ($Clean) { Remove-Tree "node_modules" }
Remove-Tree "dist"

# --- 4. 의존성 --------------------------------------------------------------
Step 4 "의존성 설치 (몇 분 걸립니다)"
if (Test-Path "package-lock.json") { & npm ci } else { & npm install }
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "npm 설치가 실패했습니다. 로그에 아래 문구가 있으면 사내망 TLS 가로채기입니다:" -ForegroundColor Yellow
  Write-Host "  self-signed certificate in certificate chain" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "순서대로 시도하세요:" -ForegroundColor Yellow
  Write-Host "  1) 이 스크립트를 그냥 다시 실행 (인증서 처리가 이미 들어 있습니다)"
  Write-Host "  2) 그래도 안 되면 전산팀에 사내 루트 인증서(.cer)를 받아:"
  Write-Host "       `$env:NODE_EXTRA_CA_CERTS='C:\경로\corp-root.pem'"
  Write-Host "     로 지정한 뒤 다시 실행"
  Write-Host "  3) GitHub 접속 자체가 막혀 있으면 Electron 바이너리를 수동으로 받아 캐시에 넣기:"
  Write-Host "       받을 파일: electron-v33.4.11-win32-x64.zip, SHASUMS256.txt-33.4.11"
  Write-Host "       넣을 위치: $env:LOCALAPPDATA\electron\Cache\"
  Write-Host "  4) 최후의 수단: powershell -ExecutionPolicy Bypass -File build-win.ps1 -Insecure"
  Fail "npm 설치 실패"
}

# --- 5. 자체 점검 -----------------------------------------------------------
Step 5 "자체 점검"
& npm run selftest
if ($LASTEXITCODE -ne 0) { Fail "자체 점검 실패. 이 상태로 빌드하면 안 됩니다." }

# --- 6. 빌드 ----------------------------------------------------------------
Step 6 "설치 파일 빌드 (electron-builder)"
& npm run build:win
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "electron-builder가 nsis·winCodeSign 리소스를 받다가 실패했다면 같은 인증서 문제입니다." -ForegroundColor Yellow
  Write-Host "캐시 위치: $env:LOCALAPPDATA\electron-builder\Cache" -ForegroundColor Yellow
  Fail "빌드 실패"
}

$setup = Get-ChildItem "dist\*.exe" | Where-Object { $_.Name -like "cardnews-setup-*" } | Select-Object -First 1
if (-not $setup) { Fail "dist 폴더에서 설치 파일을 찾지 못했습니다." }

# --- 7. 반입 패키지 ---------------------------------------------------------
Step 7 "반입 패키지 생성"
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

$hash = (Get-FileHash $setup.FullName -Algorithm SHA256).Hash
$sizeMB = [math]::Round($setup.Length / 1MB, 1)
$dest = Join-Path $OutDir $setup.Name
Copy-Item $setup.FullName $dest -Force

$info = @"
카드뉴스 생성기 — 반입 정보
================================================
파일명    : $($setup.Name)
크기      : $sizeMB MB ($($setup.Length) bytes)
SHA-256   : $hash
빌드 일시 : $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
빌드 PC   : $env:COMPUTERNAME
Node      : $nodeV

용도
  첨부 문서(PDF/HWP/HWPX/TXT)를 읽어 카드뉴스 이미지(PNG)를 만드는 프로그램.
  문안 생성과 이미지 생성은 사내 Open WebUI 서버로 요청한다.

네트워크
  설치와 실행에 인터넷이 필요 없다. 모든 의존물이 설치 파일에 포함되어 있다.
  실행 중 접속하는 곳은 사용자가 설정 화면에 입력한 Open WebUI 주소뿐이다.
  (자동 업데이트 없음, 외부 텔레메트리 없음, 맞춤법 사전 다운로드 비활성)

설치
  관리자 권한이 필요 없다. 사용자 계정 폴더에 설치된다.
  서명하지 않은 파일이라 SmartScreen 경고가 나올 수 있다.
  → "추가 정보" → "실행"

무결성 확인 (반입 후 폐쇄망 PC에서)
  certutil -hashfile "$($setup.Name)" SHA256
  결과가 위 SHA-256과 같아야 한다.
"@

$info | Out-File (Join-Path $OutDir "반입정보.txt") -Encoding UTF8
$hash | Out-File (Join-Path $OutDir "$($setup.Name).sha256") -Encoding ASCII

Write-Host ""
Write-Host $info
Write-Host "`n완료: $((Resolve-Path $OutDir).Path)" -ForegroundColor Green
Write-Host "이 폴더의 exe 하나만 반입하면 됩니다." -ForegroundColor Green
