/** 카드 → PNG. Electron 내장 Chromium으로 그린다(Playwright 불필요). PLAN.md 1 */
import { BrowserWindow, nativeImage } from "electron";
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

/** 갤러리 미리보기용 샘플 질감. 이미지 자리가 어디인지 보이게 하려고 쓴다.
 *  스톡 사진이 아니라 test/make-samples.mjs가 생성한 것이라 라이선스가 깨끗하다. */
let sampleCache;
async function sampleImage() {
  if (sampleCache === undefined) {
    try {
      sampleCache = { ext: "jpg", data: await fs.readFile(path.join(TEMPLATES, "_samples", "dusk.jpg")) };
    } catch { sampleCache = null; }
  }
  return sampleCache;
}

/** cards[i].image 는 {ext,data} 또는 없음. 반환: 저장된 파일 경로 배열 */
export async function renderCards(cards, { template, outDir }) {
  const cssUrl = "file://" + path.join(TEMPLATES, template, "style.css");
  await fs.mkdir(outDir, { recursive: true });

  return withWindow(async (win) => {
    const files = [];
    let prev = null;
    for (const [i, card] of cards.entries()) {
      const payload = {
        ...card,
        css: cssUrl,
        page: i + 1,
        total: cards.length,
        image: card.image ? dataUri(card.image) : null,
      };
      delete payload.image_hint;
      const png = await paint(win, payload, prev);
      prev = png;
      const out = path.join(outDir, `card_${String(i + 1).padStart(2, "0")}.png`);
      await fs.writeFile(out, png);
      files.push(out);
    }
    return files;
  });
}

/**
 * 한 장을 그리고 캡처한다.
 * capturePage는 합성기의 '현재' 프레임을 준다. 창을 재사용하면 새 내용이 올라오기 전에
 * 직전 카드의 프레임을 잡는 일이 실제로 생긴다(표지 자리에 마무리 카드가 찍혔다).
 * 그래서 캡처 결과가 직전 장과 완전히 같으면 한 번 더 기다렸다가 다시 잡는다.
 */
const WAITS = [40, 100, 220, 400, 650];

async function paint(win, payload, prev, { strict = true } = {}) {
  await win.webContents.executeJavaScript(`render(${JSON.stringify(payload)})`, true);
  let last = null;
  for (const wait of WAITS) {
    await new Promise((r) => setTimeout(r, wait));
    let shot = await win.webContents.capturePage();
    if (shot.getSize().width !== SIZE) shot = shot.resize({ width: SIZE, height: SIZE });
    last = shot.toPNG();
    if (!prev || !last.equals(prev)) return last;
  }
  // 결과물은 틀리느니 실패하는 게 낫다. 썸네일은 장식이라 그냥 넘어간다.
  if (strict) throw new Error("카드 렌더가 직전 장과 동일하게 나왔습니다 (캡처 경합)");
  return last;
}

/** 템플릿 갤러리용 썸네일 — 사용자의 실제 1번 카드를 각 템플릿으로 그린다 (PLAN.md 3.5) */
export async function previewTemplates(card, templates) {
  const img = card.image || (card.sample ? await sampleImage() : null);
  return withWindow(async (win) => {
    const out = {};
    let prev = null;
    for (const t of templates) {
      const payload = {
        ...card, css: "file://" + path.join(TEMPLATES, t, "style.css"),
        page: 1, total: 1, image: img ? dataUri(img) : null,
      };
      delete payload.image_hint;
      prev = await paint(win, payload, prev, { strict: false });
      out[t] = nativeImage.createFromBuffer(prev).resize({ width: 300, height: 300 }).toDataURL();
    }
    return out;
  });
}
