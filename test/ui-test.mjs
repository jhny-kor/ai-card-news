/** UI 스모크 테스트: 설정 화면이 콘솔 에러 없이 뜨는지. electron test/ui-test.mjs */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as social from "../src/lib/social.js";
import { lint } from "../src/lib/lint.js";
import { listTemplates, previewTemplates, closeRenderWindow } from "../src/lib/render.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const errors = [];

app.whenReady().then(async () => {
  ipcMain.handle("settings:get", () => ({ baseUrl: "http://localhost:3000", apiKey: "", model: "", imageModel: "",
    cards: 6, flow: "list", tone: "", outDir: "/tmp", generateImages: false, maxGenerate: 3, template: "newspaper" }));
  ipcMain.handle("settings:set", () => {});
  ipcMain.handle("templates:list", listTemplates);
  ipcMain.handle("platforms:list", () => social.PLATFORMS);
  ipcMain.handle("lint", (_e, cards) => lint(cards));
  ipcMain.handle("rerender", (_e, edits) => ({ ok: true, files: edits.map((_, i) => `card_${i}.png`), outDir: "/tmp" }));
  ipcMain.handle("captions:save", () => ({ ok: true, file: "/tmp/게시문안.txt" }));
  ipcMain.handle("preview", (_e, card, t) => previewTemplates(card, t));

  const win = new BrowserWindow({
    width: 960, height: 860, show: false,
    webPreferences: { preload: path.join(SRC, "preload.cjs"), sandbox: false, spellcheck: false },
  });
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on("preload-error", (_e, f, err) => errors.push(`preload: ${err.message}`));

  await win.loadFile(path.join(SRC, "ui", "index.html"));
  // 썸네일이 다 그려질 때까지 기다린다 (템플릿 수에 비례해 오래 걸린다)
  for (let i = 0; i < 60; i++) {
    const done = await win.webContents.executeJavaScript(`(() => {
      const all = [...document.querySelectorAll('#gallery img')];
      return all.length > 0 && all.every(i => i.src.startsWith('data:'));
    })()`);
    if (done) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  // 카드 문안 편집기 — 고쳐서 다시 그리기가 이 앱의 보완 수단이다
  const ed = await win.webContents.executeJavaScript(`(async () => {
    const before = document.querySelector('#tabs button[data-p="cards"]').disabled;
    showCards([
      { layout: "cover", title: "혁신적인 제목", body: "지금이 준비할 때입니다." },
      { layout: "statement", title: "멀쩡한 제목", body: "등기부등본 을구를 먼저 본다" },
    ]);
    showTab("cards");
    const rows = document.querySelectorAll("#cardList .card").length;
    document.querySelector('#cardList .card[data-i="1"] .title').value = "고친 제목";
    const edits = collectEdits();
    document.getElementById("recheck").click();
    await new Promise(r => setTimeout(r, 400));
    return { before, rows,
      layouts: document.querySelectorAll("#cardList .layout option").length,
      edited: edits[1].title,
      enabled: !document.querySelector('#tabs button[data-p="cards"]').disabled,
      shown: !document.getElementById("p-cards").hidden,
      flagged: document.querySelectorAll("#cardList .body.bad").length,
      why: document.querySelector('#cardList .card[data-i="0"] .why').textContent };
  })()`);
  if (ed.before !== true) errors.push("카드 탭이 처음부터 활성화돼 있다");
  if (!ed.enabled) errors.push("실행 후에도 카드 탭이 잠겨 있다");
  if (!ed.shown) errors.push("카드 패널이 안 보인다");
  if (ed.rows !== 2) errors.push(`카드 행이 ${ed.rows}개다`);
  if (ed.layouts !== 14) errors.push(`레이아웃 선택지가 카드당 7개가 아니다 (${ed.layouts})`);
  if (ed.edited !== "고친 제목") errors.push("편집 내용이 수집되지 않는다");
  if (ed.flagged < 1) errors.push("AI 티가 있는 카드에 표시가 안 된다");
  if (!/D-4|D-6/.test(ed.why)) errors.push(`위반 사유가 안 붙는다: ${ed.why}`);
  console.log(`  카드 편집기: ${ed.rows}행, 위반 표시 ${ed.flagged}건 (${ed.why.slice(0, 40)})`);

  // 게시 문안 패널 — X 가중치 계산과 탭 전환까지 확인한다
  const caps = await win.webContents.executeJavaScript(`(() => {
    showCaptions({
      x: { text: "가".repeat(150), tags: ["#전세사기"] },
      instagram: { text: "짧은 본문", tags: ["#가", "#나", "#다"] },
    });
    showTab("caps");
    const first = { shown: document.getElementById("p-caps").hidden ? "none" : "block",
                    tabs: document.querySelectorAll("#capTabs button").length,
                    len: document.getElementById("capLen").textContent,
                    over: document.getElementById("capLen").className.includes("over"),
                    text: document.getElementById("capText").value };
    document.querySelectorAll("#capTabs button")[1].click();
    return { ...first, second: document.getElementById("capLen").textContent,
             hint: document.getElementById("capHint").textContent };
  })()`);
  if (caps.shown !== "block") errors.push("게시 문안 패널이 안 보인다");
  if (caps.tabs !== 2) errors.push(`탭이 ${caps.tabs}개다`);
  // 한글 150자×2 + 줄바꿈 2 + "#전세사기"(1+4×2) = 311
  if (!caps.len.startsWith("311 / 280자")) errors.push(`X 길이 계산이 이상하다: ${caps.len} (311이어야 한다)`);
  if (!caps.over) errors.push("한도 초과인데 경고 표시가 없다");
  if (!caps.text.includes("#전세사기")) errors.push("해시태그가 본문에 안 붙었다");
  if (!/\/ 2200자/.test(caps.second)) errors.push(`탭 전환이 안 된다: ${caps.second}`);
  if (!caps.hint.includes("125")) errors.push("인스타그램 접힘 안내가 없다");
  console.log(`  게시 문안: 탭 ${caps.tabs}개, X ${caps.len}${caps.over ? " (초과 경고)" : ""}`);

  const state = await win.webContents.executeJavaScript(`(() => ({
    api: typeof window.api,
    templates: document.querySelectorAll('#gallery label').length,
    thumbs: [...document.querySelectorAll('#gallery img')].filter(i => i.src.startsWith('data:')).length,
    fields: ['baseUrl','apiKey','model','cards','flow','outDir','generateImages','maxGenerate','font']
              .filter(id => !document.getElementById(id)),
    log: document.getElementById('log').textContent.trim(),
    plats: document.querySelectorAll('#plats input').length,
  }))()`);

  if (state.api !== "object") errors.push("preload가 window.api를 노출하지 못했다");
  if (!state.templates) errors.push("템플릿 갤러리가 비었다");
  if (state.thumbs !== state.templates) errors.push(`썸네일 ${state.thumbs}/${state.templates}만 그려졌다`);
  if (state.fields.length) errors.push(`ui.js가 찾는 요소가 없다: ${state.fields.join(", ")}`);
  if (state.plats !== 4) errors.push(`플랫폼 체크박스가 ${state.plats}개다 (4개여야 한다)`);

  console.log(`  템플릿 ${state.templates}개, 썸네일 ${state.thumbs}개`);
  console.log(`  로그: ${state.log}`);
  if (errors.length) { console.error("\n에러:"); errors.forEach((e) => console.error("  " + e)); }
  else console.log("\nUI 점검 통과");

  closeRenderWindow();
  app.exit(errors.length ? 1 : 0);
});
