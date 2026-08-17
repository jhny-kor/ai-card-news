# 카드뉴스 생성기

첨부 문서(PDF/HWP/HWPX/TXT)를 읽어 카드뉴스 PNG를 만든다. 문안과 이미지는 사내 Open WebUI로 요청한다.
폐쇄망 윈도우 PC용이라 설치·실행에 인터넷이 필요 없다.

**설계 배경과 판단 근거는 [PLAN.md](PLAN.md)에 있다.** 여기는 쓰는 법만 적는다.

---

## 화면

설치하고 실행하면 이 창 하나가 전부다. 설정 영역만 스크롤하고, **진행 로그는 창 크기와 상관없이 항상 아래에 붙어 있다.**

| 실행 직후 | 템플릿 선택 (다크 모드) |
|---|---|
| ![](docs/ui-light.png) | ![](docs/ui-dark.png) |

템플릿 썸네일은 목업이 아니라 **실제로 렌더한 것**이고, 실행 후에는 방금 만든 1번 카드 문안으로 다시 그려진다.
"예쁜 샘플"이 아니라 "내 글이 저기서 어떻게 보이나"로 고르게 된다.

썸네일에는 샘플 질감이 얹혀 있어 **이미지가 템플릿의 어디에 들어가는지** 미리 보인다
(카드 아래 `이미지 · 상단 46%` 같은 표시). 샘플은 스톡 사진이 아니라
`test/make-samples.mjs`가 SVG 노이즈로 생성한 것이라 라이선스가 깨끗하다.

### 결과 — 텍스트 전용 (신문 헤드라인체, 레이아웃 6종)

<p>
<img src="docs/sample/card_01.png" width="32%"> <img src="docs/sample/card_02.png" width="32%"> <img src="docs/sample/card_03.png" width="32%"><br>
<img src="docs/sample/card_04.png" width="32%"> <img src="docs/sample/card_05.png" width="32%"> <img src="docs/sample/card_06.png" width="32%">
</p>

카드마다 레이아웃이 다르다 — 표지 / 서술 / 수치 / 목록 / 대비 / 마무리.
전부 같은 꼴로 찍어내면 그 자체가 AI 티라서, 레이아웃을 섞는 것이 설계의 일부다.

### 결과 — 이미지 배치 (상하 분할)

<p>
<img src="docs/sample-split/card_01.png" width="32%"> <img src="docs/sample-split/card_02.png" width="32%"> <img src="docs/sample-split/card_03.png" width="32%">
</p>

앞 두 장은 이미지가 있고 세 번째는 없다. **이미지가 없으면 자리를 접는다** —
빈 사각형을 남기면 미완성으로 보이기 때문이다. 실제 덱에서는 표지와 서술 카드만 이미지를 받으므로
절반 정도가 이 경로를 탄다.

### 템플릿 8종

| 템플릿 | 이미지 자리 | 성격 |
|---|---|---|
| 신문 헤드라인체 | 전면 배경 | 무채색 + 굵은 명조 + 가는 괘선. 시사·정책 자료 |
| 단색 초대형 고딕 | 전면 배경 | 배경 한 색, 글자가 화면을 꽉 채운다 |
| 사진 위 타이포 | 전면 배경 | 어두운 스크림 위 흰 글자 |
| 노트 | 전면 배경 | 크림색 종이에 괘선. 친근한 톤 |
| 매거진 에디토리얼 | 전면 배경 | 넉넉한 여백, 장식 없이 활자만으로 위계 |
| 상하 분할 | 상단 46% | 위가 사진, 아래가 글. 가장 안정적 |
| 사진 카드 | 상단 사각형 | 종이에 사진을 붙인 인화물 |
| 좌우 분할 | 좌측 38% | 세로로 긴 사진에 맞다 |

전부 [kill-ai-slop](https://github.com/yetone/kill-ai-slop)의 시각 tell 목록을 피해서 만들었다 —
인디고→바이올렛 그라데이션, 글로우, 글래스모피즘, 과대 그림자, 이모지, 아이콘 타일 없음.

### 폰트

Pretendard · 나눔명조 · 나눔손글씨 펜을 앱에 넣어 배포한다. **전부 SIL Open Font License 1.1**이라
상업 판매 소프트웨어에 번들해도 된다. 시스템 폰트에 기대면 "기본값 느낌"이 나고 맥/윈도우 결과가 갈리는데,
폐쇄망이라 실행 시 웹폰트를 받을 수도 없다. 자세한 건 [fonts/README.md](fonts/README.md).

---

## 폐쇄망 반입 절차

### 1) 인터넷 되는 윈도우 PC에서 빌드

Node.js 18 이상 설치 후:

```powershell
powershell -ExecutionPolicy Bypass -File build-win.ps1
```

`반입\` 폴더에 이것들이 생긴다:

- `cardnews-setup-0.1.0.exe` — **이 파일 하나만 반입하면 된다**
- `반입정보.txt` — 파일명·크기·SHA-256·용도·네트워크 사용 내역. 반입 신청서에 그대로 쓴다
- `*.sha256` — 해시만 담긴 파일

스크립트는 빌드 전에 자체 점검을 돌리고, 실패하면 빌드하지 않는다.

### 2) 폐쇄망 PC에서 설치

무결성부터 확인한다:

```
certutil -hashfile cardnews-setup-0.1.0.exe SHA256
```

`반입정보.txt`의 SHA-256과 같아야 한다. 그다음 실행한다.

- **관리자 권한이 필요 없다.** 사용자 계정 폴더에 설치된다
- 서명하지 않은 파일이라 SmartScreen 경고가 뜬다 → **추가 정보 → 실행**
- 설치·실행에 인터넷이 필요 없다. 모든 의존물이 exe 안에 있다

### 3) 첫 실행 설정

| 항목 | 값 |
|---|---|
| 주소 | 사내 Open WebUI 주소 (예: `http://10.x.x.x:3000`) |
| API 키 | Open WebUI에서 발급한 `sk-...` |
| 문안 모델 | **목록 조회** 를 누르면 채워진다 |

API 키는 윈도우 DPAPI로 암호화해 저장한다. 평문으로 남지 않는다.

**이미지 생성을 쓰려면** Open WebUI 관리자 설정에서 이미지 생성을 켜고 계정에 `features.image_generation` 권한을 줘야 한다.
설정 화면의 **확인** 버튼이 엔진 종류와 로컬/클라우드 여부를 알려준다.

---

## 동작

```
자료 읽기 ─┬─ 텍스트 ─→ LLM ─→ 린터 ─→ (위반 시) 수리 1회 ─┐
           └─ 이미지 ─→ 품질 필터 ─────────────────────────┼─→ 렌더 ─→ PNG
                                     부족분만 생성 ────────┘
```

- **린터**는 정규식이라 즉시 끝난다. 위반이 있을 때만 LLM을 한 번 더 부른다
- **이미지는 자료에서 뽑은 것을 먼저** 쓰고, 모자란 만큼만 생성한다. 생성은 기본 꺼짐
- 출력은 1080×1080 PNG

### AI 티 제거

`src/lib/rules.json`에 규칙이 데이터로 들어 있다. **빌드 없이 고칠 수 있다** — 설치 폴더의
`resources\app.asar`는 잠겨 있으므로, 규칙을 바꾸려면 빌드 PC에서 수정 후 다시 빌드한다.

금칙 구문(대구법·변환 공식·hype 어휘 등) 외에 **본문 길이 변동계수**와 **종결어미 반복**을 본다.
AI 카드뉴스는 모든 카드 길이가 균일한데, 금칙어로는 안 잡히고 표준편차로 잡힌다. (근거: PLAN.md 2.1)

---

## 개발

```bash
npm install
npm start                              # 앱 실행
npm run selftest                       # 린터·파서 (네트워크 불필요)
npx electron test/render-test.mjs      # 렌더 8종 × 7장 — test/out/ 에 나온다
npx electron test/ui-test.mjs          # UI 스모크
npx electron test/shot.mjs             # README용 화면 캡처 갱신
```

### 템플릿 추가

`templates/<이름>/` 에 `style.css` + `meta.json`을 두면 끝이다. 코드는 안 건드린다.
골격은 `templates/card.html`이 공유하고, 레이아웃 7종(`cover` `statement` `list` `quote` `number`
`compare` `closing`)은 body 클래스로 구분한다.

**이미지 자리도 CSS로 정한다.** `#bg`는 그냥 절대배치 div라서 템플릿이 위치를 잡으면 된다:

```css
#bg { inset: 0 0 54% 0; }                      /* 상단 46% */
body:not(.has-bg) { --split: 0%; }             /* 이미지 없으면 자리를 접는다 */
body:not(.has-bg) #bg { display: none; }
```

`meta.json`의 `image` 필드에 자리를 적어두면 갤러리에 표시된다.
샘플 질감을 다시 만들려면 `electron test/make-samples.mjs`.
