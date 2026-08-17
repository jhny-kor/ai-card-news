/** UI 스모크 테스트: 설정 화면이 콘솔 에러 없이 뜨는지. electron test/ui-test.mjs */
import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listTemplates, previewTemplates, closeRenderWindow } from "../src/lib/render.js";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const errors = [];

app.whenReady().then(async () => {
  ipcMain.handle("settings:get", () => ({ baseUrl: "http://localhost:3000", apiKey: "", model: "", imageModel: "",
    cards: 6, flow: "list", tone: "", outDir: "/tmp", generateImages: false, maxGenerate: 3, template: "newspaper" }));
  ipcMain.handle("settings:set", () => {});
  ipcMain.handle("templates:list", listTemplates);
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

  const state = await win.webContents.executeJavaScript(`(() => ({
    api: typeof window.api,
    templates: document.querySelectorAll('#gallery label').length,
    thumbs: [...document.querySelectorAll('#gallery img')].filter(i => i.src.startsWith('data:')).length,
    fields: ['baseUrl','apiKey','model','cards','flow','outDir','generateImages','maxGenerate']
              .filter(id => !document.getElementById(id)),
    log: document.getElementById('log').textContent.trim(),
  }))()`);

  if (state.api !== "object") errors.push("preload가 window.api를 노출하지 못했다");
  if (!state.templates) errors.push("템플릿 갤러리가 비었다");
  if (state.thumbs !== state.templates) errors.push(`썸네일 ${state.thumbs}/${state.templates}만 그려졌다`);
  if (state.fields.length) errors.push(`ui.js가 찾는 요소가 없다: ${state.fields.join(", ")}`);

  console.log(`  템플릿 ${state.templates}개, 썸네일 ${state.thumbs}개`);
  console.log(`  로그: ${state.log}`);
  if (errors.length) { console.error("\n에러:"); errors.forEach((e) => console.error("  " + e)); }
  else console.log("\nUI 점검 통과");

  closeRenderWindow();
  app.exit(errors.length ? 1 : 0);
});
