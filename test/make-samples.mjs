/** 샘플 질감 생성: electron test/make-samples.mjs
 *
 * 스톡 사진을 받아 넣으면 라이선스가 걸린다. SVG feTurbulence로 직접 그린다.
 * 저작권이 깨끗하고, 카드에 들어갈 때 어차피 어둡게 깔리는 질감이라 이걸로 충분하다. */
import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates", "_samples");
const SIZE = 900;

const SAMPLES = {
  paper: { base: "#cbb99a", freq: 0.9, octaves: 5, sat: 0.35, extra:
    "radial-gradient(120% 90% at 30% 20%, rgba(255,250,240,.55), transparent 65%)" },
  concrete: { base: "#8d9299", freq: 0.55, octaves: 4, sat: 0.15, extra:
    "linear-gradient(160deg, rgba(255,255,255,.35), transparent 55%)" },
  dusk: { base: "#3d4a58", freq: 0.35, octaves: 3, sat: 0.25, extra:
    "radial-gradient(90% 70% at 70% 15%, rgba(226,196,150,.45), transparent 60%)" },
};

const page = (s) => `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
  .l{position:absolute;inset:0}
  #base{background:${s.base}}
  #tint{background:${s.extra}}
  #grain{filter:url(#n);opacity:.55;mix-blend-mode:overlay;background:#808080}
</style>
<div class="l" id="base"></div><div class="l" id="grain"></div><div class="l" id="tint"></div>
<svg width="0" height="0"><filter id="n">
  <feTurbulence type="fractalNoise" baseFrequency="${s.freq}" numOctaves="${s.octaves}" seed="7"/>
  <feColorMatrix type="saturate" values="${s.sat}"/>
</filter></svg>`;

app.whenReady().then(async () => {
  await fs.mkdir(OUT, { recursive: true });
  const win = new BrowserWindow({ width: SIZE, height: SIZE, show: false, frame: false });
  for (const [name, s] of Object.entries(SAMPLES)) {
    await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(page(s)));
    await win.webContents.executeJavaScript(
      "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>r(1),120))))", true);
    let shot = await win.webContents.capturePage();
    if (shot.getSize().width !== SIZE) shot = shot.resize({ width: SIZE, height: SIZE });
    const file = path.join(OUT, `${name}.jpg`);
    await fs.writeFile(file, shot.toJPEG(78));          // 질감이라 JPEG로 충분하다. 저장소 용량 절약
    console.log(`  ${path.basename(file)}  ${Math.round((await fs.stat(file)).size / 1024)}KB`);
  }
  win.destroy();
  app.exit(0);
});
