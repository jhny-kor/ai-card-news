/** 첨부 자료 → { text, images }. PLAN.md 4.3 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { unzipSync } from "fflate";
import { hwpText, hwpImages } from "./hwp.js";

const MIN_LONG_SIDE = 800;
const MAX_RATIO = 4;
const MIN_BYTES = 15_000;
const SCAN_COVERAGE = 0.9;   // 페이지 면적의 90% 이상이면 스캔본으로 본다

// --------------------------------------------------------------- 형식별 읽기

async function readPdf(buffer) {
  const mupdf = await import("mupdf");                 // ESM 전용 — require 불가
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");
  const text = [];
  const images = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i);
    text.push(page.toStructuredText().asText());
    const [x0, y0, x1, y1] = page.getBounds();
    const pageW = Math.abs(x1 - x0), pageH = Math.abs(y1 - y0);
    // mupdf.Device는 상속이 아니라 콜백 객체를 받는다 (dist/mupdf.js:1231).
    // extends로 만들면 콜백이 조용히 안 불린다.
    const dev = new mupdf.Device({
      fillImage(image, ctm) {
        try {
          // 이미지 픽셀 크기와 페이지 크기는 단위가 다르다(px vs pt).
          // 전면 스캔 판정은 ctm으로 계산한 '배치 크기'로 해야 한다.
          const [a, b, c, d] = ctm;
          const cover = pageW && pageH
            ? [Math.hypot(a, b) / pageW, Math.hypot(c, d) / pageH]
            : null;
          images.push({
            ext: "png", w: image.getWidth(), h: image.getHeight(), cover,
            data: Buffer.from(image.toPixmap().asPNG()),
          });
        } catch { /* 디코드 실패한 이미지는 버린다 */ }
      },
      fillImageMask(image, ctm) { this.fillImage(image, ctm); },
    });
    page.run(dev, mupdf.Matrix.identity);
    dev.close();
  }
  return { text: text.join("\n"), images };
}

function readHwpx(buffer) {
  const zip = unzipSync(new Uint8Array(buffer));
  const dec = new TextDecoder("utf-8");
  const sections = Object.keys(zip)
    .filter((n) => /^Contents\/section\d+\.xml$/.test(n))
    .sort();
  const text = sections
    .map((n) => dec.decode(zip[n])
      .replace(/<hp:p[\s>]/g, "\n<hp:p ")
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
    .join("\n");
  const images = Object.keys(zip)
    .filter((n) => /^BinData\/.+\.(png|jpe?g|gif|bmp)$/i.test(n))
    .map((n) => ({ ext: path.extname(n).slice(1).toLowerCase(), data: Buffer.from(zip[n]) }));
  return { text, images };
}

export async function readSource(file) {
  const ext = path.extname(file).toLowerCase();
  const buffer = await fs.readFile(file);
  if (ext === ".txt" || ext === ".md") return { text: buffer.toString("utf8"), images: [] };
  if (ext === ".pdf") return readPdf(buffer);
  if (ext === ".hwpx") return readHwpx(buffer);
  if (ext === ".hwp") return { text: hwpText(buffer), images: hwpImages(buffer) };
  throw new Error(`지원하지 않는 형식입니다: ${ext}`);
}

// --------------------------------------------------------------- 품질 필터

/** 로고·구분선·아이콘·반복 이미지·전면 스캔을 걸러낸다. 중복 제거를 먼저 돌린다. */
export function filterImages(images) {
  const seen = new Set();
  const kept = [];
  for (const im of images) {
    const hash = crypto.createHash("sha1").update(im.data).digest("hex").slice(0, 12);
    if (seen.has(hash)) continue;                       // 머리말 로고는 모든 페이지에 반복된다
    seen.add(hash);
    if (im.data.length < MIN_BYTES) continue;
    if (im.w && im.h) {
      const long = Math.max(im.w, im.h);
      if (long < MIN_LONG_SIDE) continue;
      if (long / Math.min(im.w, im.h) > MAX_RATIO) continue;   // 구분선·배너
      // 페이지를 거의 다 덮으면 스캔본이다. 카드뉴스 소재로 쓸 수 없다.
      if (im.cover && im.cover[0] >= SCAN_COVERAGE && im.cover[1] >= SCAN_COVERAGE) continue;
    }
    kept.push({ ...im, hash, area: (im.w || 0) * (im.h || 0) });
  }
  return kept.sort((a, b) => b.area - a.area);          // 큰 것부터 = 표지에 최고 해상도
}

export async function collect(files) {
  let text = "";
  let images = [];
  for (const f of files) {
    const r = await readSource(f);
    text += (text ? "\n\n" : "") + r.text;
    images = images.concat(r.images);
  }
  return { text, images: filterImages(images) };
}
