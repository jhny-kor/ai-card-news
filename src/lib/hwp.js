/** hwp(5.0) 파서. cardnews.py의 검증된 파이썬 파서를 그대로 옮긴 것. */
import * as CFB from "cfb";
import zlib from "node:zlib";

// 확장 제어문자: 본문에서 wchar 8개(16바이트)를 통째로 차지한다.
const EXT_CTRL = new Set([...Array(12).keys()].map((i) => i + 1).concat([14, 15, 16, 17]));

function paraText(raw) {
  const out = [];
  for (let i = 0; i + 2 <= raw.length; ) {
    const code = raw.readUInt16LE(i);
    if (EXT_CTRL.has(code)) { i += 16; continue; }
    if (code < 32) {
      if (code === 10 || code === 13) out.push("\n");
      i += 2;
      continue;
    }
    out.push(String.fromCharCode(code));
    i += 2;
  }
  return out.join("");
}

function inflateRaw(buf) {
  try { return zlib.inflateRawSync(buf); } catch { return null; }
}

function entries(cfb, dir) {
  return cfb.FullPaths
    .map((p, i) => ({ path: p, file: cfb.FileIndex[i] }))
    .filter((e) => e.path.includes(`/${dir}/`) && e.file?.content?.length)
    .sort((a, b) => (parseInt(a.path.replace(/\D/g, ""), 10) || 0) - (parseInt(b.path.replace(/\D/g, ""), 10) || 0));
}

export function hwpText(buffer) {
  const cfb = CFB.read(buffer, { type: "buffer" });
  const header = CFB.find(cfb, "FileHeader");
  if (!header) throw new Error("hwp 파일이 아닙니다 (FileHeader 없음)");
  const compressed = Boolean(Buffer.from(header.content)[36] & 1);

  const parts = [];
  for (const { file } of entries(cfb, "BodyText")) {
    let data = Buffer.from(file.content);
    if (compressed) {
      const un = inflateRaw(data);
      if (!un) continue;
      data = un;
    }
    for (let i = 0; i + 4 <= data.length; ) {
      const rec = data.readUInt32LE(i);
      i += 4;
      const tag = rec & 0x3ff;
      let size = (rec >> 20) & 0xfff;
      if (size === 0xfff) { size = data.readUInt32LE(i); i += 4; }
      if (tag === 67) parts.push(paraText(data.subarray(i, i + size)));  // HWPTAG_PARA_TEXT
      i += size;
    }
  }
  return parts.filter((p) => p.trim()).join("\n");
}

const MAGIC = [
  [Buffer.from([0xff, 0xd8, 0xff]), "jpg"],
  [Buffer.from("PNG\r\n"), "png"],
  [Buffer.from("GIF8"), "gif"],
  [Buffer.from("BM"), "bmp"],
];

/** BinData 스트림에서 이미지 추출. 압축 여부는 스트림마다 다를 수 있어 둘 다 시도한다. */
export function hwpImages(buffer) {
  const cfb = CFB.read(buffer, { type: "buffer" });
  const out = [];
  for (const { file } of entries(cfb, "BinData")) {
    const raw = Buffer.from(file.content);
    for (const cand of [inflateRaw(raw), raw]) {
      if (!cand) continue;
      const hit = MAGIC.find(([m]) => cand.subarray(0, m.length).equals(m));
      if (hit) { out.push({ ext: hit[1], data: cand }); break; }
    }
  }
  return out;
}
