/** README용 화면 캡처: electron test/shot.mjs */
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { listTemplates, previewTemplates, renderCards, closeRenderWindow } from "../src/lib/render.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");

// 첫 실행 상태 그대로. 키는 비어 있고 모델은 아직 조회 전이다.
const SETTINGS = {
  baseUrl: "http://10.20.30.40:3000", apiKey: "", model: "qwen3:14b", imageModel: "",
  cards: 6, flow: "list", tone: "친근하고 쉬운 말투", template: "newspaper",
  generateImages: true, maxGenerate: 3,
  outDir: "C:\\Users\\user\\Documents\\카드뉴스",
};

const CARDS = [
  { layout: "cover", title: "전세 계약 전 5분", body: "등기부등본만 봐도 걸러낼 수 있다" },
  { layout: "statement", title: "을구를 먼저 본다", body: "근저당권 채권최고액이 매매가의 60%를 넘으면 위험하다. 계약 당일 다시 뗀다" },
  { layout: "number", title: "700원", body: "인터넷등기소 열람 수수료" },
  { layout: "list", title: "확인할 세 가지", body: "소유자와 계약자가 같은지\n근저당권 설정 금액\n전입세대 열람 내역" },
  { layout: "compare", title: "이렇게 바뀐다", body: "계약 전 확인 → 보증금 보호\n확인 없이 계약 → 순위 밀림" },
  { layout: "closing", title: "지금 등기부를 떼자", body: "출처: 국토교통부" },
];

const LOG = [
  "자료 1개 읽는 중…",
  "텍스트 8,412자, 쓸 만한 이미지 2장",
  "qwen3:14b 호출 중… (로컬 모델은 몇 분 걸릴 수 있습니다)",
  "카드 6장 생성",
  "AI 티 3건 발견 — 수리 요청",
  "  [C-8] 2번 카드: 대구법 'A가 아니라 B'",
  "  [D-4] 4번 카드: hype 어휘",
  "  [UNI-LEN] 덱 전체: 본문 길이가 너무 균일하다 (변동계수 0",
  "수리 후 위반 없음",
  "이미지: 자료에서 2장 배정 (추출 2장)",
  "부족분 1장 생성합니다 (상한 3장)",
  "  생성 1/1: muted paper texture, soft side light…",
  "이미지 렌더링 중…",
  "완료 — C:\\Users\\user\\Documents\\카드뉴스",
];

app.whenReady().then(async () => {
  await fs.mkdir(DOCS, { recursive: true });
  ipcMain.handle("settings:get", () => SETTINGS);
  ipcMain.handle("settings:set", () => {});
  ipcMain.handle("templates:list", listTemplates);
  ipcMain.handle("preview", (_e, card, t) => previewTemplates(card, t));

  for (const theme of ["light", "dark"]) {
    nativeTheme.themeSource = theme;
    const win = new BrowserWindow({
      width: 960, height: 900, show: false,
      webPreferences: { preload: path.join(ROOT, "src", "preload.cjs"), sandbox: false, spellcheck: false },
    });
    await win.loadFile(path.join(ROOT, "src", "ui", "index.html"));
    await new Promise((r) => setTimeout(r, 2200));

    await win.webContents.executeJavaScript(`
      document.getElementById("files").textContent = "1개: 전세사기 예방 안내.pdf";
      document.getElementById("log").textContent = ${JSON.stringify(LOG.join("\n"))};
      document.getElementById("log").scrollTop = 9999;
      document.getElementById("openOut").disabled = false;
      document.getElementById("backend").innerHTML =
        '엔진 <b>comfyui</b> — 로컬. 프롬프트가 밖으로 나가지 않습니다.';
      // 다크 샷은 템플릿 갤러리가 보이도록 설정 영역을 내려둔다
      ${theme === "dark" ? 'document.getElementById("top").scrollTop = 9999;' : ""}
      true;`);
    await new Promise((r) => setTimeout(r, 400));

    const shot = await win.webContents.capturePage();
    await fs.writeFile(path.join(DOCS, `ui-${theme}.png`), shot.toPNG());
    win.destroy();
    console.log(`docs/ui-${theme}.png`);
  }

  // 결과 카드 예시
  const out = await renderCards(CARDS, { template: "newspaper", outDir: path.join(DOCS, "sample") });
  console.log(`샘플 카드 ${out.length}장`);

  closeRenderWindow();
  app.exit(0);
});
