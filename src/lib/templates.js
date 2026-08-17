/** 템플릿 메타 읽기. render.js와 분리해 electron 없이도 검사할 수 있게 한다. */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEMPLATES = fileURLToPath(new URL("../../templates/", import.meta.url));

export async function listTemplates() {
  const dirs = (await fs.readdir(TEMPLATES, { withFileTypes: true })).filter((d) => d.isDirectory());
  const out = [];
  for (const d of dirs) {
    try {
      const meta = JSON.parse(await fs.readFile(path.join(TEMPLATES, d.name, "meta.json"), "utf8"));
      out.push({ id: d.name, ...meta });
    } catch { /* meta.json 없는 폴더는 템플릿이 아니다 (_samples 등) */ }
  }
  return out.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}
