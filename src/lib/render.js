/** 카드 → PNG. Electron 내장 Chromium으로 그린다(Playwright 불필요). PLAN.md 1 */
import { BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TEMPLATES = fileURLToPath(new URL("../../templates/", import.meta.url));
const SIZE = 1080;   // 인스타그램 정사각 규격. 캡처는 디스플레이 배율을 타므로 항상 이 크기로 맞춘다.

export function templateDir(name) {
  return path.join(TEMPLATES, name);
}

export async function listTemplates() {
  const dirs = (await fs.readdir(TEMPLATES, { withFileTypes: true })).filter((d) => d.isDirectory());
  const out = [];
  for (const d of dirs) {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(TEMPLATES, d.name, "meta.json"), "utf8"));
      out.push({ id: d.name, ...meta });
    } catch { /* meta.json 없는 폴더는 템플릿이 아니다 */ }
  }
  return out.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

// 렌더 창은 하나를 재사용한다. 매번 만들고 부수면 다음 loadFile이 ERR_ABORTED로 죽는다.
let renderWin = null;

async function withWindow(fn) {
  if (!renderWin || renderWin.isDestroyed()) {
    renderWin = new BrowserWindow({
      width: SIZE, height: SIZE, show: false, frame: false,
      webPreferences: { backgroundThrottling: false, spellcheck: false },
    });
    await renderWin.loadFile(path.join(TEMPLATES, "card.html"));
  }
  return fn(renderWin);
}

/** 메인 창이 닫힐 때 같이 정리한다. 안 그러면 숨은 창 때문에 앱이 종료되지 않는다. */
export function closeRenderWindow() {
  if (renderWin && !renderWin.isDestroyed()) renderWin.destroy();
  renderWin = null;
}

const dataUri = (img) => `data:image/${img.ext === "jpg" ? "jpeg" : img.ext};base64,${img.data.toString("base64")}`;

/** cards[i].image 는 {ext,data} 또는 없음. 반환: 저장된 파일 경로 배열 */
export async function renderCards(cards, { template, outDir }) {
  const cssUrl = "file://" + path.join(TEMPLATES, template, "style.css");
  await fs.mkdir(outDir, { recursive: true });

  return withWindow(async (win) => {
    const files = [];
    for (const [i, card] of cards.entries()) {
      const payload = {
        ...card,
        css: cssUrl,
        page: i + 1,
        total: cards.length,
        image: card.image ? dataUri(card.image) : null,
      };
      delete payload.image_hint;
      await win.webContents.executeJavaScript(
        `render(${JSON.stringify(payload)}); settled();`, true);
      let shot = await win.webContents.capturePage();
      if (shot.getSize().width !== SIZE) shot = shot.resize({ width: SIZE, height: SIZE });
      const out = path.join(outDir, `card_${String(i + 1).padStart(2, "0")}.png`);
      await fs.writeFile(out, shot.toPNG());
      files.push(out);
    }
    return files;
  });
}

/** 템플릿 갤러리용 썸네일 — 사용자의 실제 1번 카드를 각 템플릿으로 그린다 (PLAN.md 3.5) */
export async function previewTemplates(card, templates) {
  return withWindow(async (win) => {
    const out = {};
    for (const t of templates) {
      const payload = {
        ...card, css: "file://" + path.join(TEMPLATES, t, "style.css"),
        page: 1, total: 1, image: card.image ? dataUri(card.image) : null,
      };
      delete payload.image_hint;
      await win.webContents.executeJavaScript(`render(${JSON.stringify(payload)}); settled();`, true);
      const shot = (await win.webContents.capturePage()).resize({ width: 300, height: 300 });
      out[t] = shot.toDataURL();
    }
    return out;
  });
}
