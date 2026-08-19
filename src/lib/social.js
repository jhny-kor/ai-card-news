/** 게시 플랫폼별 문안. 같은 글을 네 곳에 복붙하면 잘리거나 스팸처럼 보인다.
 *
 *  수치 출처는 README 참고. 플랫폼이 규칙을 바꾸면 이 표만 고치면 된다. */

import { looseJson } from "./llm.js";

export const PLATFORMS = [
  {
    id: "instagram", name: "인스타그램",
    max: 2200,
    fold: 125,          // 이 지점에서 "...더 보기"로 접힌다. 핵심은 그 앞에 와야 한다
    best: 150,
    tags: [3, 5], tagMax: 30,
    link: false,
    guide: "첫 125자 안에 핵심을 넣어라. 그 뒤는 접힌다. 링크는 못 쓰니 '프로필 링크'로 안내한다. " +
           "해시태그는 3~5개. 30개까지 되지만 많이 달수록 스팸으로 보인다.",
  },
  {
    id: "x", name: "X",
    max: 280,
    weighted: true,     // X는 한글을 2자로 센다 → 실질 140자
    best: 100,
    tags: [1, 2], tagMax: 3,
    link: true,
    guide: "한글은 한 글자가 2로 계산된다. 짧을수록 좋다(100 미만이 참여율이 높다). " +
           "해시태그는 1~2개만. 한 문장으로 끊어라.",
  },
  {
    id: "facebook", name: "페이스북",
    max: 63206,
    best: 80,
    tags: [0, 2], tagMax: 3,
    link: true,
    guide: "짧을수록 좋다. 80자 안쪽이 이상적이다. 해시태그는 효과가 거의 없으니 0~2개.",
  },
  {
    id: "threads", name: "쓰레드",
    max: 500,
    best: 300,
    tags: [0, 1], tagMax: 1,
    link: true,
    guide: "대화하듯 쓴다. 해시태그 문화가 없다 — 태그는 0개, 넣어도 1개까지.",
  },
];

export const platform = (id) => PLATFORMS.find((p) => p.id === id);

/**
 * X는 CJK를 2로 센다(twitter-text 가중치). 한글 문안에서는 체감 길이가 절반이라
 * 이걸 안 세면 항상 초과한다.
 */
export function weightedLength(text) {
  const s = String(text ?? "");
  const cjk = /[ᄀ-ᇿ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-퟿豈-﫿︰-﹏＀-｠￠-￦]/;
  let n = 0;
  for (const ch of s) n += cjk.test(ch) ? 2 : 1;
  return n;
}

export const lengthOf = (text, p) => (p?.weighted ? weightedLength(text) : [...String(text ?? "")].length);

/** 화면에 붙여넣을 최종 형태 — 본문과 해시태그를 합친다 */
export function compose(caption) {
  const text = String(caption?.text || "").trim();
  const tags = (caption?.tags || []).map((t) => (t.startsWith("#") ? t : `#${t}`));
  return tags.length ? `${text}\n\n${tags.join(" ")}` : text;
}

export function buildPrompt(cards, ids, { tone = "" } = {}) {
  const chosen = ids.map(platform).filter(Boolean);
  const summary = cards.map((c, i) => `${i + 1}. ${c.title}${c.body ? " — " + c.body.replace(/\n/g, " / ") : ""}`).join("\n");

  return `아래는 이미 만들어진 카드뉴스 문안이다. 이걸 각 플랫폼에 올릴 게시글로 바꿔라.

--- 카드뉴스 ---
${summary}

--- 플랫폼별 규칙 ---
${chosen.map((p) => `[${p.id}] ${p.name} — 본문 ${p.max}자 이내(권장 ${p.best}자), 해시태그 ${p.tags[0]}~${p.tags[1]}개
  ${p.guide}`).join("\n")}
${tone ? `\n톤: ${tone}\n` : ""}
공통 규칙 — 어기면 AI가 쓴 티가 난다:
- 카드에 없는 사실이나 수치를 만들지 마라.
- 이모지를 쓰지 마라.
- 금지: "A가 아니라 B" 대구, "X에서 Y로", "~할 때입니다", "결론적으로",
  "혁신적/획기적/압도적/필수적/놀라운/강력한", "지금 바로", "놓치지 마세요",
  연결어미(-고 -며 -지만 -면서 -아서) 바로 뒤의 쉼표.
- 플랫폼마다 문장을 다시 써라. 같은 글을 길이만 잘라 넣지 마라.
- 해시태그는 자료의 실제 주제어로만. 일반적인 태그(#일상 #소통)를 채우지 마라.

아래 JSON만 출력해라. 설명을 붙이지 마라.
{${chosen.map((p) => `"${p.id}":{"text":"본문","tags":["#태그"]}`).join(",")}}`;
}

export function parse(reply, ids) {
  // 카드와 같은 복구 로직을 쓴다 — 작은 모델은 여기서도 똑같이 JSON을 깨뜨린다
  const raw = looseJson(reply)[0];
  if (!raw || typeof raw !== "object") throw new Error("게시 문안 형식을 알아볼 수 없습니다");
  const out = {};
  for (const id of ids) {
    const v = raw[id];
    if (!v || typeof v !== "object" || !v.text) continue;
    out[id] = {
      text: String(v.text).trim(),
      tags: (Array.isArray(v.tags) ? v.tags : [])
        .map((t) => String(t).trim().replace(/^#*/, "#"))
        .filter((t) => t.length > 1),
    };
  }
  return out;
}

/** 플랫폼 규칙 위반만 본다. 문장 자체의 AI 티는 lint.js가 같이 검사한다. */
export function check(captions) {
  const issues = [];
  for (const [id, cap] of Object.entries(captions)) {
    const p = platform(id);
    if (!p) continue;
    const full = compose(cap);
    const len = lengthOf(full, p);
    if (len > p.max)
      issues.push({ id, msg: `${p.name}: ${len}자로 한도 ${p.max}자를 넘었다. 줄여라` +
                              (p.weighted ? " (X는 한글을 2자로 센다)" : "") });
    const n = cap.tags.length;
    if (n > p.tagMax) issues.push({ id, msg: `${p.name}: 해시태그 ${n}개는 한도 ${p.tagMax}개를 넘었다` });
    else if (n > p.tags[1]) issues.push({ id, msg: `${p.name}: 해시태그 ${n}개는 많다. ${p.tags[0]}~${p.tags[1]}개로 줄여라` });
    else if (n < p.tags[0]) issues.push({ id, msg: `${p.name}: 해시태그가 ${n}개다. ${p.tags[0]}개 이상 붙여라` });
    if (p.link === false && /https?:\/\//.test(full))
      issues.push({ id, msg: `${p.name}: 본문 링크가 동작하지 않는다. "프로필 링크"로 안내해라` });
  }
  return issues;
}

/** 결과 폴더에 저장할 텍스트 */
export function toFile(captions) {
  return Object.entries(captions).map(([id, cap]) => {
    const p = platform(id);
    const full = compose(cap);
    const len = lengthOf(full, p);
    return `${"=".repeat(52)}\n${p.name}  (${len}/${p.max}자${p.weighted ? ", 한글은 2자로 계산" : ""})\n${"=".repeat(52)}\n${full}\n`;
  }).join("\n");
}
