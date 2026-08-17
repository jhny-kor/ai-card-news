# 번들 폰트

**전부 SIL Open Font License 1.1.** 상업적으로 판매하는 소프트웨어에 넣어 배포해도 된다 —
OFL이 명시적으로 임베딩과 번들링을 허용한다. 금지되는 건 **폰트를 그 자체로 파는 것**뿐이다.

| 파일 | 서체 | 저작권자 | 라이선스 | 크기 |
|---|---|---|---|---|
| `PretendardVariable.woff2` | Pretendard (가변, 100~900) | 길형진 | OFL 1.1 · [`OFL-Pretendard.txt`](OFL-Pretendard.txt) | 2.0MB |
| `NanumMyeongjo-Regular.woff2` | 나눔명조 | NHN | OFL 1.1 · [`OFL-NanumMyeongjo.txt`](OFL-NanumMyeongjo.txt) | 0.5MB |
| `NanumMyeongjo-ExtraBold.woff2` | 나눔명조 ExtraBold | NHN | 〃 | 0.7MB |
| `NanumPenScript-Regular.woff2` | 나눔손글씨 펜 | NHN | OFL 1.1 · [`OFL-NanumPenScript.txt`](OFL-NanumPenScript.txt) | 0.6MB |

라이선스 전문을 함께 배포해야 하므로 `OFL-*.txt`를 지우면 안 된다. electron-builder가 `fonts/**/*`를
통째로 패키지에 넣으므로 자동으로 따라간다.

## 왜 번들하는가

시스템 폰트(맑은 고딕 / Apple SD Gothic Neo)에 기대면 두 가지 문제가 있다.

1. **"기본값 느낌"이 난다.** 카드뉴스에서 AI 티를 줄이는 가장 큰 레버가 폰트다. 금칙어 규칙 스무 개보다 효과가 크다.
2. **맥과 윈도우 결과가 달라진다.** 폴백 순서가 다르면 자간·행간이 어긋나 같은 자료로 다른 카드가 나온다.

폐쇄망 배포라 실행 시 웹폰트를 받아올 수도 없다. 파일로 넣는 것 말고 방법이 없다.

## 어디에 쓰이나

| 서체 | 쓰는 곳 |
|---|---|
| Pretendard | 전 템플릿 본문·목록·대비, 설정 화면 UI |
| 나눔명조 | 신문 헤드라인체 / 매거진 에디토리얼 / 사진 카드 의 제목 |
| 나눔손글씨 펜 | 노트 템플릿의 제목·머리말만. **본문에는 안 쓴다 — 작은 크기에서 안 읽힌다** |

`@font-face` 선언은 두 군데에 있다. 카드 렌더용은 [`templates/card.html`](../templates/card.html),
설정 화면용은 [`src/ui/index.html`](../src/ui/index.html).

## 교체·추가

원본 TTF는 저장소에 두지 않는다(9MB → woff2 1.8MB). 다시 만들려면:

```bash
npm i -D wawoff2
node -e "const w=require('wawoff2'),f=require('fs');(async()=>{const t=f.readFileSync('fonts/X.ttf');
  f.writeFileSync('fonts/X.woff2',Buffer.from(await w.compress(t)))})()"
npm uninstall -D wawoff2
```

받은 곳: [Pretendard](https://github.com/orioncactus/pretendard/releases) ·
나눔 계열은 [google/fonts](https://github.com/google/fonts) 의 `ofl/nanummyeongjo`, `ofl/nanumpenscript`.

⚠️ 다른 폰트를 추가할 때는 **OFL인지 먼저 확인한다.** 무료로 배포되는 한글 폰트라도
"소프트웨어에 임베딩하여 유료 판매"를 막는 자체 라이선스가 흔하다(Gmarket Sans, 에스코어드림 등은 별도 확인 필요).
서브셋팅은 하지 않는다 — 자료에 어떤 한글이 나올지 모르므로 완성형 전체가 필요하다.
