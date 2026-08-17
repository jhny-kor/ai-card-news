<#
  카드뉴스 생성기 — 윈도우 빌드 + 반입 패키지 생성

  인터넷이 되는 윈도우 PC에서 실행한다. 결과물 exe 하나만 폐쇄망으로 반입하면 된다.

      powershell -ExecutionPolicy Bypass -File build-win.ps1

  옵션:
      -Clean          node_modules와 dist를 지우고 처음부터
      -OutDir <경로>  반입 패키지를 복사할 위치 (기본: .\반입)
#>
param(
  [switch]$Clean,
  [string]$OutDir = "반입"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "`n실패: $msg" -ForegroundColor Red; exit 1 }

# --- 1. 사전 확인 -----------------------------------------------------------
Step 1 "빌드 환경 확인"
try { $nodeV = (& node --version) } catch { Fail "Node.js가 없습니다. https://nodejs.org 에서 LTS를 설치하세요." }
try { $npmV = (& npm --version) } catch { Fail "npm을 찾을 수 없습니다." }
Write-Host "    node $nodeV / npm $npmV"

$major = [int]($nodeV -replace '^v(\d+).*', '$1')
if ($major -lt 18) { Fail "Node.js 18 이상이 필요합니다 (현재 $nodeV)." }

try { $null = Invoke-WebRequest -Uri "https://registry.npmjs.org" -UseBasicParsing -TimeoutSec 10 }
catch { Fail "npm 레지스트리에 접속할 수 없습니다. 이 스크립트는 인터넷이 되는 PC에서 실행해야 합니다." }
Write-Host "    네트워크 정상"

# --- 2. 정리 ----------------------------------------------------------------
if ($Clean) {
  Step 2 "이전 결과물 삭제"
  foreach ($d in @("node_modules", "dist")) {
    if (Test-Path $d) { Remove-Item $d -Recurse -Force; Write-Host "    $d 삭제" }
  }
} else {
  Step 2 "정리 건너뜀 (-Clean 으로 강제 가능)"
  if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }
}

# --- 3. 의존성 --------------------------------------------------------------
Step 3 "의존성 설치 (몇 분 걸립니다)"
if (Test-Path "package-lock.json") { & npm ci } else { & npm install }
if ($LASTEXITCODE -ne 0) { Fail "npm 설치 실패" }

# --- 4. 자체 점검 -----------------------------------------------------------
Step 4 "자체 점검"
& npm run selftest
if ($LASTEXITCODE -ne 0) { Fail "자체 점검 실패. 이 상태로 빌드하면 안 됩니다." }

# --- 5. 빌드 ----------------------------------------------------------------
Step 5 "설치 파일 빌드 (electron-builder)"
& npm run build:win
if ($LASTEXITCODE -ne 0) { Fail "빌드 실패" }

$setup = Get-ChildItem "dist\*.exe" | Where-Object { $_.Name -like "cardnews-setup-*" } | Select-Object -First 1
if (-not $setup) { Fail "dist 폴더에서 설치 파일을 찾지 못했습니다." }

# --- 6. 반입 패키지 ---------------------------------------------------------
Step 6 "반입 패키지 생성"
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
