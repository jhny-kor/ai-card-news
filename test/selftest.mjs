/** 네트워크 없이 도는 자체 점검. build-win.ps1이 빌드 전에 실행한다. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { lint, repairPrompt } from "../src/lib/lint.js";
import { parseCards, endpoint, buildPrompt } from "../src/lib/llm.js";
import { readSource, filterImages } from "../src/lib/parse.js";
import { attachImages } from "../src/lib/images.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ids = (issues) => new Set(issues.map((i) => i.id));
let n = 0;
const test = async (name, fn) => { await fn(); console.log(`  ok  ${name}`); n++; };

// --------------------------------------------------------------- 린터

await test("S1 금칙 구문을 잡는다", () => {
  const bad = [
    { layout: "cover", title: "선택에서 필수로", body: "지금이 준비할 때입니다." },
    { layout: "statement", title: "혁신적인 변화", body: "단순한 도구가 아니라 파트너입니다." },
    { layout: "statement", title: "정리", body: "결론적으로, 전문가에 의해 검증되었습니다 😀" },
  ];
  const got = ids(lint(bad));
  for (const id of ["D-7", "D-6", "D-4", "C-8", "D-1", "A-9", "C-5"])
    assert.ok(got.has(id), `${id}를 놓쳤다. 잡은 것: ${[...got]}`);
});

await test("연결어미 뒤 쉼표(C-11)를 잡는다", () => {
  const got = ids(lint([{ title: "가", body: "정책을 만들고, 예산을 붙였다." }]));
  assert.ok(got.has("C-11"));
});

await test("길이가 균일하면 UNI-LEN을 낸다", () => {
  const same = Array.from({ length: 5 }, (_, i) => ({ title: `제목${i}`, body: "가".repeat(40) }));
  assert.ok(ids(lint(same)).has("UNI-LEN"));
});

await test("길이가 섞이면 UNI-LEN을 내지 않는다", () => {
  const varied = [12, 47, 25, 68, 31].map((len, i) => ({ title: `제목${i}`, body: "가".repeat(len) }));
  assert.ok(!ids(lint(varied)).has("UNI-LEN"));
});

await test("같은 종결어미 연속을 잡는다", () => {
  const bodies = ["예산이 늘었습니다", "인원도 늘었습니다", "기간이 줄었습니다", "절차가 바뀌었습니다"];
  const got = ids(lint(bodies.map((b, i) => ({ title: `ㄱ${i}`, body: b }))));
  assert.ok(got.has("UNI-END"), `잡은 것: ${[...got]}`);
});

await test("길이 제한을 잡는다", () => {
  const got = lint([{ title: "가".repeat(25), body: "나".repeat(90) }]);
  assert.equal(got.filter((i) => i.id === "LEN").length, 2);
});

await test("깨끗한 문안은 통과한다", () => {
  const clean = [
    { layout: "cover", title: "전세 계약 전 5분", body: "등기부등본만 봐도 걸러낼 수 있다" },
    { layout: "statement", title: "을구를 먼저 본다", body: "근저당권 채권최고액이 매매가의 60%를 넘으면 위험하다. 계약 당일 다시 뗀다" },
    { layout: "closing", title: "700원이면 뗀다", body: "인터넷등기소에서 바로 열람" },
  ];
  assert.deepEqual(lint(clean), [], JSON.stringify(lint(clean), null, 1));
});

await test("수리 프롬프트는 위반이 없으면 null", () => {
  assert.equal(repairPrompt([{ title: "가", body: "나" }], []), null);
  assert.match(repairPrompt([{ title: "가" }], [{ id: "D-1", msg: "m", where: "1번 카드" }]), /D-1/);
});

// --------------------------------------------------------------- LLM 응답 파싱

await test("qwen3 <think> 블록을 걷어낸다", () => {
  const reply = '<think>음, 6장으로...</think>\n```json\n[{"layout":"cover","title":"가","body":"나"}]\n```';
  assert.deepEqual(parseCards(reply), [{ layout: "cover", title: "가", body: "나" }]);
});

await test("모르는 layout은 statement로 떨어뜨린다", () => {
  assert.equal(parseCards('[{"layout":"fancy","title":"가"}]')[0].layout, "statement");
});

await test("제목 없는 항목은 버린다", () => {
  assert.equal(parseCards('[{"title":"가"},{"body":"제목없음"}]').length, 1);
});

await test("엔드포인트 정규화", () => {
  assert.equal(endpoint("http://localhost:3000", "/api/chat/completions"), "http://localhost:3000/api/chat/completions");
  assert.equal(endpoint("http://localhost:3000/api/", "/api/chat/completions"), "http://localhost:3000/api/chat/completions");
  assert.equal(endpoint("http://x:3000", "/api/v1/images/generations"), "http://x:3000/api/v1/images/generations");
});

await test("프롬프트에 금칙 규칙과 layout enum이 들어간다", () => {
  const p = buildPrompt({ text: "자료", n: 6 });
  for (const s of ["cover", "closing", "아니라", "때입니다", "이모지", "길이를 다르게"])
    assert.ok(p.includes(s), `프롬프트에 "${s}"가 없다`);
});

// --------------------------------------------------------------- 파서

await test("txt를 읽는다", async () => {
  const f = path.join(HERE, "tmp.txt");
  fs.writeFileSync(f, "본문입니다");
  assert.equal((await readSource(f)).text, "본문입니다");
  fs.unlinkSync(f);
});

await test("hwpx 텍스트와 이미지를 뽑는다", async () => {
  const png = Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "binary"), Buffer.alloc(20_000, 7)]);
  const zip = zipSync({
    "Contents/section0.xml":
      strToU8('<hs:sec xmlns:hp="x"><hp:p><hp:t>첫 문단</hp:t></hp:p><hp:p><hp:t>둘째 문단</hp:t></hp:p></hs:sec>'),
    "BinData/image1.png": new Uint8Array(png),
  });
  const f = path.join(HERE, "tmp.hwpx");
  fs.writeFileSync(f, Buffer.from(zip));
  const r = await readSource(f);
  assert.match(r.text, /첫 문단/);
  assert.match(r.text, /둘째 문단/);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].ext, "png");
  fs.unlinkSync(f);
});

await test("PDF 텍스트와 이미지를 뽑고 로고·구분선·중복을 거른다", async () => {
  const fixture = path.join(HERE, "fixtures", "fixture.pdf");
  if (!fs.existsSync(fixture)) return console.log("      (fixture.pdf 없음 — 건너뜀)");
  const r = await readSource(fixture);
  assert.match(r.text, /테스트 문서/);
  assert.ok(r.images.length >= 7, `원본 이미지 ${r.images.length}개`);
  const kept = filterImages(r.images);
  assert.equal(kept.length, 1, `필터 후 ${kept.length}개 (사진 1장만 남아야 한다)`);
  assert.equal(kept[0].w, 1200);
});

await test("품질 필터: 전면 스캔을 버린다", () => {
  const scan = { data: Buffer.alloc(50_000), w: 1190, h: 1660, cover: [1.0, 0.99], ext: "png" };
  const photo = { data: Buffer.alloc(50_000, 1), w: 1200, h: 800, cover: [0.62, 0.3], ext: "png" };
  const kept = filterImages([scan, photo]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].w, 1200);
});

await test("품질 필터: 로고·구분선·중복을 버린다", () => {
  const logo = { data: Buffer.alloc(20_000, 2), w: 120, h: 120, ext: "png" };
  const rule = { data: Buffer.alloc(20_000, 3), w: 2000, h: 8, ext: "png" };
  const tiny = { data: Buffer.alloc(1_000, 4), w: 1200, h: 900, ext: "png" };
  const ok = { data: Buffer.alloc(40_000, 5), w: 1200, h: 900, ext: "png" };
  assert.deepEqual(filterImages([logo, rule, tiny, ok, { ...ok }]).map((i) => i.w), [1200]);
});

// --------------------------------------------------------------- 이미지 배분

const deck = () => [
  { layout: "cover", title: "표지" },
  { layout: "statement", title: "서술1" },
  { layout: "list", title: "목록" },
  { layout: "statement", title: "서술2" },
  { layout: "closing", title: "마무리" },
];
const img = (n) => ({ ext: "png", data: Buffer.alloc(100, n) });
const off = { generateImages: false, maxGenerate: 3 };
const on = { generateImages: true, maxGenerate: 3 };

await test("추출본을 표지·서술 카드에만 큰 순서로 붙인다", async () => {
  const cards = deck();
  const r = await attachImages(cards, [img(1), img(2)], off);
  assert.deepEqual(r, { assigned: 2, generated: 0 });
  assert.ok(cards[0].image && cards[1].image, "표지와 첫 서술에 붙어야 한다");
  assert.ok(!cards[2].image && !cards[4].image, "목록·마무리에는 안 붙는다");
  assert.ok(!cards[3].image, "추출본이 모자라면 비워둔다");
});

await test("생성이 꺼져 있으면 부족분을 그냥 비운다", async () => {
  const cards = deck();
  let called = 0;
  const r = await attachImages(cards, [], off, { generate: async () => { called++; return Buffer.alloc(9); } });
  assert.deepEqual(r, { assigned: 0, generated: 0 });
  assert.equal(called, 0, "생성 꺼짐인데 호출됐다");
});

await test("부족분만 생성하고 상한을 지킨다", async () => {
  const cards = [...deck(), { layout: "statement", title: "서술3" }, { layout: "statement", title: "서술4" }];
  let called = 0;
  const r = await attachImages(cards, [img(1)], { generateImages: true, maxGenerate: 2 },
                               { generate: async () => { called++; return Buffer.alloc(9); } });
  assert.equal(r.assigned, 1);
  assert.equal(r.generated, 2, "상한 2장을 넘었다");
  assert.equal(called, 2);
});

await test("image_hint를 생성 프롬프트로 넘긴다", async () => {
  const cards = [{ layout: "cover", title: "표지", image_hint: "concrete texture" }];
  const seen = [];
  await attachImages(cards, [], on, { generate: async (h) => { seen.push(h); return Buffer.alloc(9); } });
  assert.deepEqual(seen, ["concrete texture"]);
});

await test("생성 첫 실패에서 멈춘다 (과금·시간 낭비 방지)", async () => {
  const cards = [{ layout: "cover", title: "ㄱ" }, { layout: "statement", title: "ㄴ" },
                 { layout: "statement", title: "ㄷ" }];
  let called = 0;
  const r = await attachImages(cards, [], on, {
    generate: async () => { called++; throw new Error("403"); },
  });
  assert.equal(called, 1, `첫 실패 후에도 ${called}번 호출됐다`);
  assert.equal(r.generated, 0);
});

console.log(`\n${n}개 통과`);
