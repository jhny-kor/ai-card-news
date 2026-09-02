<#
  카드뉴스 생성기 — 실행 안 되는 PC 진단

      powershell -ExecutionPolicy Bypass -File 진단.ps1

  결과를 그대로 복사해서 보내주면 원인을 짚을 수 있다.
  아무것도 설치하지 않고 읽기만 한다.
#>
$ErrorActionPreference = "Continue"
function Line($k, $v, $color = "Gray") { Write-Host ("  {0,-16}{1}" -f $k, $v) -ForegroundColor $color }
function Head($t) { Write-Host "`n$t" -ForegroundColor Cyan }

Write-Host "카드뉴스 생성기 진단" -ForegroundColor Cyan
Write-Host ("=" * 52)

# --- 1. 윈도우 -------------------------------------------------------------
Head "1. 윈도우"
$os = Get-CimInstance Win32_OperatingSystem
$build = [int]($os.BuildNumber)
Line "제품" $os.Caption
Line "빌드" "$($os.Version) (build $build)"
Line "아키텍처" $env:PROCESSOR_ARCHITECTURE
if ($build -lt 10240) {
    Line "판정" "Windows 10 미만 — 이 앱은 실행되지 않습니다 (Electron 33은 Win10 이상)" "Red"
} elseif ($build -lt 17763) {
    Line "판정" "Windows 10 초기 빌드 — 실행이 불안정할 수 있습니다" "Yellow"
} else {
    Line "판정" "요구 사항 충족" "Green"
}
if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") {
    Line "주의" "ARM64 PC입니다. x64 빌드라 에뮬레이션으로 돌며 실패할 수 있습니다" "Yellow"
}

# --- 2. 설치 위치 ----------------------------------------------------------
Head "2. 설치 위치"
$paths = @(
    (Join-Path $env:LOCALAPPDATA "Programs\cardnews\CardNews.exe"),
    (Join-Path $env:ProgramFiles "cardnews\CardNews.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "cardnews\CardNews.exe")
)
$found = $null
foreach ($p in $paths) {
    if ($p -and (Test-Path $p)) { $found = $p; Line "찾음" $p "Green" }
}
if (-not $found) {
    Line "찾음" "없음 — 설치되지 않았거나 다른 경로입니다" "Red"
} else {
    $f = Get-Item $found
    Line "크기" ("{0:N1} MB" -f ($f.Length / 1MB))
    Line "수정일" $f.LastWriteTime
    if ($found -like "$env:LOCALAPPDATA*") {
        Line "주의" "사용자 폴더에 설치됨. 정책이 이 경로 실행을 막으면 안 켜집니다" "Yellow"
    }
}

# --- 3. 실행 정책 ----------------------------------------------------------
Head "3. 실행 차단 정책"
$applocker = $false
try {
    $p = Get-AppLockerPolicy -Effective -ErrorAction Stop
    $xml = $p.ToXml()
    if ($xml -match 'Action="Deny"' -or $xml -match 'EnforcementMode="Enabled"') {
        $applocker = $true
        Line "AppLocker" "정책 있음 — 사용자 폴더 실행을 막고 있을 수 있습니다" "Yellow"
    } else { Line "AppLocker" "정책은 있으나 강제 아님" }
} catch { Line "AppLocker" "없음 또는 조회 불가" }

$srp = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\Safer\CodeIdentifiers"
if (Test-Path $srp) { Line "SRP" "소프트웨어 제한 정책 있음" "Yellow" }
else { Line "SRP" "없음" }

# --- 4. 백신 ---------------------------------------------------------------
Head "4. 백신"
try {
    $av = Get-CimInstance -Namespace root\SecurityCenter2 -ClassName AntiVirusProduct -ErrorAction Stop
    foreach ($a in $av) { Line "제품" $a.displayName }
} catch { Line "제품" "조회 불가" }
try {
    $t = Get-MpThreatDetection -ErrorAction Stop | Where-Object { $_.Resources -match "cardnews|CardNews" }
    if ($t) { Line "격리" "CardNews 관련 탐지 기록 있음 — 백신이 지웠을 수 있습니다" "Red" }
    else { Line "격리" "관련 기록 없음" "Green" }
} catch { Line "격리" "Defender 조회 불가 (타사 백신일 수 있음)" }

# --- 5. 실행 흔적 ----------------------------------------------------------
Head "5. 실행 흔적"
$log = Join-Path $env:APPDATA "cardnews\logs\startup.log"
if (Test-Path $log) {
    Line "로그" $log "Green"
    Write-Host "  --- 마지막 5줄 ---" -ForegroundColor Gray
    Get-Content $log -Tail 5 | ForEach-Object { Write-Host "  $_" }
    Line "판정" "앱이 시작은 했습니다. 창이 안 뜨면 GPU 문제일 수 있습니다" "Yellow"
} else {
    Line "로그" "없음 — 앱이 한 번도 시작되지 못했습니다" "Red"
    Line "판정" "차단(정책·백신)이나 윈도우 버전 문제일 가능성이 큽니다" "Yellow"
}

$err = Get-WinEvent -FilterHashtable @{LogName='Application'; Level=2} -MaxEvents 40 -ErrorAction SilentlyContinue |
       Where-Object { $_.Message -match "CardNews|cardnews" }
if ($err) {
    Head "6. 이벤트 로그 오류"
    $err | Select-Object -First 3 | ForEach-Object {
        Write-Host "  $($_.TimeCreated)" -ForegroundColor Yellow
        Write-Host "  $($_.Message.Split("`n")[0])"
    }
}

# --- 해결 순서 -------------------------------------------------------------
Head "다음에 해볼 것"
Write-Host "  1) 설치 프로그램을 다시 실행해 '모든 사용자용 설치'를 고르세요 (관리자 권한 필요)"
Write-Host "     → Program Files 에 설치되어 정책 차단을 피합니다"
if ($found) {
    Write-Host "  2) 흰 창만 뜬다면 그래픽 가속을 끄고 실행:"
    Write-Host "     `"$found`" --safe" -ForegroundColor White
}
Write-Host "  3) 그래도 안 되면 위 내용을 전부 복사해서 보내주세요"
Write-Host ""
