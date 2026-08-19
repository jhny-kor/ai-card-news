/** 카드 문안 AI 티 린터. 결정론적이라 즉시 끝난다. PLAN.md 2.2 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const RULES = JSON.parse(fs.readFileSync(fileURLToPath(new URL("./rules.json", import.meta.url)), "utf8"));

const field = (card, scope) =>
  scope === "title" ? [card.title || ""] : scope === "body" ? [card.body || ""] : [card.title || "", card.body || ""];

function countAll(re, text) {
  return (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
}

/** 표준편차 / 평균. 0에 가까울수록 길이가 균일하다 = AI 신호 */
function lengthCV(cards) {
  const lens = cards.map((c) => (c.body || "").length).filter((n) => n > 0);
  if (lens.length < 3) return null;
  const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
  if (!mean) return null;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
  return sd / mean;
}

/**
 * 기계적으로 안전한 위반만 코드가 직접 고친다.
 * 이걸 LLM에게 되물으면 느린 로컬 모델에서 호출 한 번을 통째로 버리게 된다.
 * 뜻이 바뀔 여지가 있는 규칙(hype 어휘, 대구법 등)은 손대지 않고 린터가 잡게 둔다.
 */
export function autofix(cards, rules = RULES) {
  const applied = [];
  const out = cards.map((card, i) => {
    const next = { ...card };
    for (const field of ["title", "body"]) {
      let text = next[field];
      if (typeof text !== "string") continue;
      for (const rule of rules.autofix || []) {
        const re = new RegExp(rule.pattern, rule.flags || "g");
        const fixed = text.replace(re, rule.replace);
        if (fixed !== text) {
          applied.push({ id: rule.id, where: `${i + 1}번 카드`, why: rule.why });
          text = fixed;
        }
      }
      next[field] = text.trim();
    }
    return next;
  });
  return { cards: out, applied };
}

export function lint(cards, rules = RULES) {
  const issues = [];
  const add = (id, msg, where, sample) => issues.push({ id, msg, where, sample });

  for (const rule of rules.phrase) {
    const re = new RegExp(rule.pattern, rule.flags || "");
    let total = 0;
    const hits = [];
    cards.forEach((card, i) => {
      for (const text of field(card, rule.scope)) {
        const n = countAll(re, text);
        if (n) { total += n; hits.push({ card: i + 1, sample: (text.match(re) || [""])[0] }); }
      }
    });
    if (!total) continue;
    if (rule.severity === "S1") {
      for (const h of hits) add(rule.id, rule.msg, `${h.card}번 카드`, h.sample);
    } else if (total > (rule.limit ?? 0)) {
      add(rule.id, `${rule.msg} (덱 전체 ${total}회, 허용 ${rule.limit ?? 0}회)`,
          hits.map((h) => `${h.card}번`).join(" "), hits[0].sample);
    }
  }

  // --- 길이 제한
  const { titleMax, bodyMax } = rules.limits;
  cards.forEach((card, i) => {
    if ((card.title || "").length > titleMax)
      add("LEN", `제목이 ${titleMax}자를 넘는다 (${card.title.length}자)`, `${i + 1}번 카드`, card.title);
    if ((card.body || "").length > bodyMax)
      add("LEN", `본문이 ${bodyMax}자를 넘는다 (${card.body.length}자)`, `${i + 1}번 카드`, card.body);
  });

  // --- 균일성 (XDAC): 단문에서 가장 강한 신호
  const cv = lengthCV(cards);
  if (cv !== null && cv < rules.uniformity.minLengthCV)
    add("UNI-LEN",
        `본문 길이가 너무 균일하다 (변동계수 ${cv.toFixed(3)} < ${rules.uniformity.minLengthCV}). ` +
        "짧은 카드와 긴 카드를 섞어라. 내용을 늘리지 말고 문장을 붙이거나 끊어라",
        "덱 전체", null);

  // --- 종결어미 반복
  const { endingChars, maxSameEnding } = rules.uniformity;
  let run = 1;
  for (let i = 1; i < cards.length; i++) {
    const a = (cards[i - 1].body || "").trim().slice(-endingChars);
    const b = (cards[i].body || "").trim().slice(-endingChars);
    run = a && a === b ? run + 1 : 1;
    if (run > maxSameEnding) {
      add("UNI-END", `같은 종결어미가 ${run}장 연속이다 ("${b}"). 종결을 변주해라`,
          `${i - run + 2}~${i + 1}번 카드`, b);
      run = 1;
    }
  }

  return issues;
}

/** 위반 목록을 LLM 수리 요청문으로. 위반이 없으면 null */
export function repairPrompt(cards, issues) {
  if (!issues.length) return null;
  const lines = issues.map((it) =>
    `- [${it.id}] ${it.where}: ${it.msg}` + (it.sample ? ` (예: "${it.sample}")` : ""));
  return `아래 카드뉴스 문안에 AI 티가 남아 있다. 지적된 부분만 고쳐라.

${lines.join("\n")}

규칙:
- 지적되지 않은 카드는 한 글자도 바꾸지 마라.
- 자료에 없는 사실이나 수치를 새로 만들지 마라.
- layout과 image_hint 필드는 그대로 둬라.
- 같은 형식의 JSON 배열만 출력해라.

${JSON.stringify(cards, null, 1)}`;
}

export { RULES };
