import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { collect } from "./lib/parse.js";
import { lint, repairPrompt } from "./lib/lint.js";
import * as llm from "./lib/llm.js";
import { renderCards, listTemplates, previewTemplates, closeRenderWindow } from "./lib/render.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = () => path.join(app.getPath("userData"), "settings.json");

const DEFAULTS = {
  baseUrl: "http://localhost:3000",
  apiKey: "",
  model: "",
  imageModel: "",
  cards: 6,
  flow: "list",
  tone: "",
  template: "newspaper",
  generateImages: false,
  maxGenerate: 3,
  outDir: "",
};

// --------------------------------------------------------------- 설정

async function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(SETTINGS(), "utf8"));
    if (saved.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
      saved.apiKey = safeStorage.decryptString(Buffer.from(saved.apiKeyEnc, "base64"));
    }
  } catch { /* 첫 실행 */ }
  delete saved.apiKeyEnc;
  return { ...DEFAULTS, outDir: path.join(app.getPath("documents"), "카드뉴스"), ...saved };
}

async function saveSettings(cfg) {
  const out = { ...cfg };
  if (out.apiKey && safeStorage.isEncryptionAvailable()) {
    out.apiKeyEnc = safeStorage.encryptString(out.apiKey).toString("base64");
    delete out.apiKey;                                   // 평문으로 남기지 않는다
  }
  await fs.mkdir(path.dirname(SETTINGS()), { recursive: true });
  await fs.writeFile(SETTINGS(), JSON.stringify(out, null, 2), "utf8");
}

// --------------------------------------------------------------- 이미지 배분

/** 추출본을 먼저 붙이고, 모자란 만큼만 생성한다. PLAN.md 4.4 */
async function attachImages(cards, pool, cfg, log) {
  const targets = cards.filter((c) => c.layout === "cover" || c.layout === "statement");
  if (!targets.length) return;

  const spare = [...pool];
  for (const card of targets) {
    if (!spare.length) break;
    card.image = spare.shift();
  }
  const filled = targets.filter((c) => c.image).length;
  log(`이미지: 자료에서 ${filled}장 배정 (추출 ${pool.length}장)`);

  const missing = targets.filter((c) => !c.image);
  if (!missing.length || !cfg.generateImages) {
    if (missing.length) log(`${missing.length}장은 이미지 없이 갑니다 (생성 꺼짐)`);
    return;
  }
  const todo = missing.slice(0, cfg.maxGenerate);
  log(`부족분 ${todo.length}장 생성합니다 (상한 ${cfg.maxGenerate}장)`);
  for (const [i, card] of todo.entries()) {
    const hint = card.image_hint || "soft blurred texture, muted tones, empty space";
    log(`  생성 ${i + 1}/${todo.length}: ${hint.slice(0, 50)}…`);
    try {
      card.image = { ext: "png", data: await llm.generateImage(cfg, hint) };
    } catch (e) {
      log(`  생성 실패: ${e.message}`);
      break;                                             // 첫 실패에서 멈춘다. 과금·시간 낭비 방지
    }
  }
}

// --------------------------------------------------------------- 파이프라인

async function run({ files, cfg }, log) {
  log(`자료 ${files.length}개 읽는 중…`);
  const { text, images } = await collect(files);
  log(`텍스트 ${text.length.toLocaleString()}자, 쓸 만한 이미지 ${images.length}장`);
  if (text.trim().length < 50)
    throw new Error("추출된 텍스트가 거의 없습니다. 스캔본 PDF라면 OCR이 필요합니다.");

  log(`${cfg.model} 호출 중… (로컬 모델은 몇 분 걸릴 수 있습니다)`);
  let cards = llm.parseCards(await llm.chat(cfg, llm.buildPrompt({ text, n: cfg.cards, flow: cfg.flow, tone: cfg.tone })));
  log(`카드 ${cards.length}장 생성`);

  let issues = lint(cards);
  if (issues.length) {
    log(`AI 티 ${issues.length}건 발견 — 수리 요청`);
    for (const it of issues.slice(0, 8)) log(`  [${it.id}] ${it.where}: ${it.msg.split(".")[0]}`);
    try {
      const fixed = llm.parseCards(await llm.chat(cfg, repairPrompt(cards, issues)));
      if (fixed.length === cards.length) cards = fixed;
      else log("  수리 결과 장수가 달라 원본을 유지합니다");
      const left = lint(cards);
      log(left.length ? `수리 후 ${left.length}건 남음 (그대로 진행)` : "수리 후 위반 없음");
    } catch (e) {
      log(`  수리 실패, 원본으로 진행: ${e.message}`);
    }
  } else {
    log("AI 티 검사 통과");
  }

  await attachImages(cards, images, cfg, log);

  log("이미지 렌더링 중…");
  const outDir = cfg.outDir || path.join(app.getPath("documents"), "카드뉴스");
  const out = await renderCards(cards, { template: cfg.template, outDir });
  log(`완료 — ${outDir}`);
  return { files: out, cards: cards.map(({ image, ...c }) => c), outDir };
}

// --------------------------------------------------------------- 창 / IPC

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960, height: 900, minWidth: 820,
    title: "카드뉴스 생성기",
    // spellcheck는 구글 CDN에서 사전을 받으려 한다. 폐쇄망에서는 무조건 꺼야 한다.
    webPreferences: { preload: path.join(HERE, "preload.cjs"), sandbox: false, spellcheck: false },
  });
  mainWindow.loadFile(path.join(HERE, "ui", "index.html"));
  mainWindow.on("closed", closeRenderWindow);   // 숨은 렌더 창이 남으면 앱이 종료되지 않는다
}

const log = (msg) => mainWindow?.webContents.send("log", String(msg));

app.whenReady().then(() => {
  ipcMain.handle("settings:get", loadSettings);
  ipcMain.handle("settings:set", (_e, cfg) => saveSettings(cfg));
  ipcMain.handle("templates:list", listTemplates);

  ipcMain.handle("files:pick", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "자료 선택",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "문서", extensions: ["pdf", "hwp", "hwpx", "txt", "md"] }],
    });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle("dir:pick", async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? "" : r.filePaths[0];
  });

  ipcMain.handle("models:list", (_e, cfg) => llm.listModels(cfg));
  ipcMain.handle("imageModels:list", (_e, cfg) => llm.listImageModels(cfg));
  ipcMain.handle("imageConfig", (_e, cfg) => llm.imageConfig(cfg));
  ipcMain.handle("preview", (_e, card, templates) => previewTemplates(card, templates));
  ipcMain.handle("open", (_e, p) => shell.openPath(p));

  ipcMain.handle("run", async (_e, payload) => {
    try {
      return { ok: true, ...(await run(payload, log)) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());

export { run, attachImages };
