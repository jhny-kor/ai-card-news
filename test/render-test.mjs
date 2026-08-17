/** Electron 렌더 경로 점검: electron test/render-test.mjs */
import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { renderCards, listTemplates, previewTemplates } from "../src/lib/render.js";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");

const CARDS = [
  { layout: "cover", title: "전세 계약 전 5분", body: "등기부등본만 봐도 걸러낼 수 있다" },
  { layout: "statement", title: "을구를 먼저 본다", body: "근저당권 채권최고액이 매매가의 60%를 넘으면 위험하다. 계약 당일 다시 뗀다" },
  { layout: "number", title: "700원", body: "인터넷등기소 열람 수수료" },
  { layout: "list", title: "확인할 세 가지", body: "소유자와 계약자가 같은지\n근저당권 설정 금액\n전입세대 열람 내역" },
  { layout: "quote", title: "국토교통부 전세사기 예방 안내", body: "계약 당일 등기부를 다시 확인하는 것만으로 상당수를 예방할 수 있다" },
  { layout: "compare", title: "이렇게 바뀐다", body: "계약 전 확인 → 보증금 보호\n확인 없이 계약 → 순위 밀림" },
  { layout: "closing", title: "지금 등기부를 떼자", body: "출처: 국토교통부" },
];

app.whenReady().then(async () => {
  let bad = 0;
  const templates = (await listTemplates()).map((t) => t.id);
  console.log("템플릿:", templates.join(", "));
  if (!templates.length) { console.error("템플릿이 없다"); app.exit(1); }

  // 표지에 실제 이미지를 얹어 has-bg 경로도 렌더한다. 사진 위 타이포는 이게 본체다.
  const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fixture.pdf");
  if (fs.existsSync(fixture)) {
    const { collect } = await import("../src/lib/parse.js");
    const { images } = await collect([fixture]);
    if (images[0]) { CARDS[0].image = images[0]; console.log(`표지 이미지: ${images[0].w}x${images[0].h}`); }
    else { console.error("픽스처에서 이미지를 못 얻었다"); bad++; }
  }

  for (const t of templates) {
    const dir = path.join(OUT, t);
    const files = await renderCards(CARDS, { template: t, outDir: dir });
    if (files.length !== CARDS.length) { console.error(`${t}: 장수 불일치`); bad++; }
    for (const f of files) {
      const size = fs.statSync(f).size;
      if (size < 5_000) { console.error(`${t}: ${path.basename(f)} 이 너무 작다 (${size}B) — 빈 화면일 수 있다`); bad++; }
    }
    console.log(`  ${t}: ${files.length}장, 평균 ${Math.round(files.reduce((a, f) => a + fs.statSync(f).size, 0) / files.length / 1024)}KB`);
  }

  // 폰트 조합을 바꾸면 결과가 실제로 달라져야 한다 (선택이 먹히는지)
  const { listTemplates: lt } = await import("../src/lib/templates.js");
  const metas = await lt();
  for (const m of metas) {
    const opts = m.fonts || [];
    if (opts.length < 2) continue;
    const dirs = [];
    for (const f of opts.slice(0, 2)) {
      const d = path.join(OUT, "_font", `${m.id}-${f.id}`);
      await renderCards([CARDS[0]], { template: m.id, outDir: d, font: f.id });
      dirs.push(fs.readFileSync(path.join(d, "card_01.png")));
    }
    if (dirs[0].equals(dirs[1])) { console.error(`${m.id}: 폰트를 바꿔도 결과가 같다`); bad++; }
  }
  console.log(`  폰트 전환: 조합 2개 이상인 템플릿 ${metas.filter((m) => (m.fonts || []).length > 1).length}개 확인`);

  const thumbs = await previewTemplates(CARDS[0], templates);
  for (const t of templates) {
    if (!String(thumbs[t] || "").startsWith("data:image/png;base64,")) { console.error(`${t}: 썸네일 실패`); bad++; }
  }
  console.log(`  썸네일 ${Object.keys(thumbs).length}개`);

  console.log(bad ? `\n실패 ${bad}건` : `\n렌더 점검 통과 — ${OUT}`);
  app.exit(bad ? 1 : 0);
});
