/** 숫자 환각 검증. 작은 모델의 가장 위험한 실패는 수치를 지어내는 것이다.
 *
 *  프롬프트로 "지어내지 마라"고 막는 건 지켜질 때만 유효하다. 여기서는 카드에 나온 숫자를
 *  원문에서 실제로 찾아본다. 결정론적이라 모델 성능과 무관하게 동작한다. */

const MAGNITUDE = "조억만천백";
const UNIT = "%|퍼센트|원|명|건|개|년|월|일|시간|분|초|배|위|㎡|km|kg|톤|가지|차례|번";

// 숫자 + 자릿수(만·억) + 단위를 한 덩어리로 본다.
// "10만 명"을 10으로 쪼개면 흔한 숫자로 보여 환각을 놓친다.
const RE = new RegExp(String.raw`(\d[\d,]*(?:\.\d+)?)\s*([${MAGNITUDE}]?)\s*(${UNIT})?`, "g");

export function numbers(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(RE)) {
    const digits = m[1].replace(/,/g, "").replace(/\.$/, "");
    if (!digits) continue;
    out.push({ digits, mag: m[2] || "", unit: m[3] || "", key: digits + (m[2] || ""), text: m[0].trim() });
  }
  return out;
}

/**
 * 자릿수도 단위도 없는 한 자리~10 은 넘어간다 — "1. 을구" 같은 번호 매기기라 원문에 없어도 정상이다.
 * 반대로 단위가 붙으면(700원, 3건) 반드시 확인한다.
 */
const isOrdinal = (n) => !n.mag && !n.unit && Number(n.digits) <= 10 && !n.digits.includes(".");

export function checkNumbers(cards, source) {
  const known = new Set(numbers(source).map((n) => n.key));
  const issues = [];
  cards.forEach((card, i) => {
    const seen = new Set();
    for (const field of ["title", "body"]) {
      for (const n of numbers(card[field])) {
        if (isOrdinal(n) || seen.has(n.key) || known.has(n.key)) continue;
        seen.add(n.key);
        issues.push({
          id: "FACT",
          where: `${i + 1}번 카드`,
          msg: `"${n.text}" 는 자료에 없는 숫자다. 자료의 값으로 바꾸거나 문장에서 빼라`,
          sample: n.text,
        });
      }
    }
  });
  return issues;
}
