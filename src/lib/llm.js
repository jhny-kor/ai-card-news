/** Open WebUI 호출. 문안(chat)과 이미지 생성 모두 같은 키를 쓴다. PLAN.md 4.1 */

export const LAYOUTS = ["cover", "statement", "list", "quote", "number", "compare", "closing"];

const FLOW = {
  list: "도입 → 정보 1..n → 정리. 항목을 나열하는 구성.",
  story: "why → how → what. 문제를 제기하고 원인을 짚은 뒤 결론을 내는 구성.",
};

export function buildPrompt({ text, n, flow = "list", tone = "" }) {
  return `다음 자료로 인스타그램 카드뉴스 ${n}장의 문안을 만들어라.

구성: ${FLOW[flow] || FLOW.list}
${tone ? `톤: ${tone}\n` : ""}
각 카드는 layout을 아래 중에서 고른다. 내용에 맞는 것을 골라라. 전부 statement로 채우지 마라.
${LAYOUTS.join(" / ")}
- cover: 1번 카드 고정. 표지
- statement: 소제목 + 설명 (기본)
- list: 항목 나열. body에 줄바꿈으로 3~5개
- quote: 자료에 있는 인용문이 있을 때만
- number: 수치 하나가 핵심일 때. title에 숫자만
- compare: 전/후, O/X 대비. body에 줄바꿈으로 2줄
- closing: 마지막 카드 고정. 요약

문장 규칙 — 어기면 AI가 쓴 티가 난다:
- 제목 20자 이내, 본문 80자 이내.
- **카드마다 길이를 다르게 써라.** 전부 비슷한 길이면 실패다. 짧은 카드와 긴 카드를 섞어라.
- 종결어미를 변주해라. 같은 어미가 3장 넘게 연속되면 안 된다.
- 금지: "A가 아니라 B" 대구, "X에서 Y로", "~할 때입니다", "결론적으로",
  "혁신적/획기적/압도적/필수적/놀라운/강력한", "주목할 만하다", "~에 의해" 피동, "되어진다",
  이모지, 연결어미(-고 -며 -지만 -면서 -아서) 바로 뒤의 쉼표.
- 자료에 없는 사실과 수치를 절대 만들지 마라. 통계를 지어내지 마라.

image_hint: 그 카드 뒤에 깔 **배경 질감**을 영어 명사구로. 주제를 그림으로 그리지 마라.
  사람·얼굴·손·글자·로고는 절대 넣지 마라. 질감, 흐린 배경, 빛, 재질 위주로.
  예: "blurred concrete texture, low directional light, muted tones, empty space"

아래 JSON 배열만 출력해라. 설명을 붙이지 마라.
[{"layout":"cover","title":"...","body":"...","image_hint":"..."}]

--- 자료 ---
${text.slice(0, 12000)}`;
}

/**
 * 작은 모델은 JSON을 자주 깨뜨린다. 한 번 실패했다고 버리면 전체 실행이 날아가므로
 * 흔한 고장을 순서대로 복구해본다. 되살릴 수 없을 때만 포기한다.
 */
export function looseJson(reply) {
  let text = String(reply ?? "")
    .replace(/<think>[\s\S]*?<\/think>/g, "")        // qwen3 추론 블록
    .replace(/```(?:json|javascript)?/gi, "")         // 코드펜스
    .replace(/```/g, "")
    .trim();

  // <think> 가 닫히지 않은 채 JSON이 뒤따르기도 한다. 뒤를 통째로 자르면 멀쩡한 답을 버린다.
  const open = text.lastIndexOf("<think>");
  if (open >= 0) {
    const after = text.slice(open);
    const json = after.search(/[[{]/);
    text = json >= 0 ? text.slice(open + json) : text.slice(0, open);
  }

  const arr = text.indexOf("[");
  const obj = text.indexOf("{");
  if (arr < 0 && obj < 0) throw new Error(`응답에서 JSON을 찾지 못했습니다:\n${text.slice(0, 400)}`);

  // 먼저 나오는 쪽이 진짜 시작이다. 객체 안에 배열이 들어 있는 경우(게시 문안)를
  // 배열로 오인하면 통째로 파싱에 실패한다.
  const isArray = arr >= 0 && (obj < 0 || arr < obj);
  const body = isArray ? text.slice(arr) : `[${text.slice(obj)}]`;

  const tries = [
    body,
    body.replace(/,\s*([\]}])/g, "$1"),                                  // 후행 쉼표
    body.replace(/,\s*([\]}])/g, "$1").replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":'),  // 작은따옴표 키
    truncateToLast(body),                                                // 잘린 응답
    truncateToLast(body.replace(/,\s*([\]}])/g, "$1")),
  ];
  for (const candidate of tries) {
    if (!candidate) continue;
    try {
      const out = JSON.parse(candidate);
      if (Array.isArray(out)) return out;
      if (out && typeof out === "object") return [out];
    } catch { /* 다음 전략 */ }
  }
  throw new Error(`JSON을 복구하지 못했습니다:\n${body.slice(0, 400)}`);
}

/** 응답이 중간에 끊겼을 때 마지막으로 완성된 객체까지만 남기고 배열을 닫는다 */
function truncateToLast(body) {
  const last = body.lastIndexOf("}");
  if (last < 0) return null;
  return body.slice(0, last + 1).replace(/,\s*$/, "") + "]";
}

export function parseCards(reply) {
  return looseJson(reply)
    .filter((c) => c && typeof c === "object" && c.title)
    .map((c) => ({ ...c, layout: LAYOUTS.includes(c.layout) ? c.layout : "statement" }));
}

// --------------------------------------------------------------- HTTP

/**
 * 사용자가 넣는 주소는 제각각이다 — 서버 루트만 넣기도 하고,
 * Open WebUI 화면에 표시되는 API 주소(.../api/v1)를 그대로 붙여넣기도 한다.
 * 무엇을 넣든 서버 루트로 되돌린 뒤 정해진 경로를 붙인다.
 * (이걸 안 하면 .../api/v1/api/models 같은 주소가 만들어져 HTML이 돌아온다)
 */
export function endpoint(baseUrl, path) {
  const base = String(baseUrl || "").trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v1$/, "")
    .replace(/\/api$/, "")
    .replace(/\/v1$/, "");
  return base + path;
}

async function req(cfg, path, { method = "GET", body, raw = false } = {}) {
  const url = endpoint(cfg.baseUrl, path);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new Error("API 키가 틀렸습니다 (401)");
    if (res.status === 404) throw new Error(`그런 주소가 없습니다 (404): ${url}\n서버 주소를 확인하세요`);
    if (res.status === 403 && path.includes("images"))
      throw new Error("이미지 생성 권한이 없습니다 (403). Open WebUI 관리자 설정에서 이미지 생성을 켜고 " +
                      "계정에 features.image_generation 권한을 주세요");
    throw new Error(`${res.status} ${detail}`);
  }
  if (raw) return Buffer.from(await res.arrayBuffer());
  // 주소가 어긋나면 Open WebUI가 오류 대신 웹페이지를 200으로 돌려준다.
  // 그대로 JSON 파싱하면 "Unexpected token '<'" 이라는 엉뚱한 메시지가 나온다.
  const type = res.headers.get("content-type") || "";
  if (!type.includes("json")) {
    throw new Error(`JSON 대신 ${type.split(";")[0] || "알 수 없는 형식"}이 왔습니다.\n` +
                    `요청한 주소: ${url}\n서버 주소가 맞는지 확인하세요`);
  }
  return res.json();
}

export async function listModels(cfg) {
  const r = await req(cfg, "/api/models");
  return (r.data || r).map((m) => m.id).filter(Boolean);
}

export async function chat(cfg, prompt) {
  const r = await req(cfg, "/api/chat/completions", {
    method: "POST",
    body: { model: cfg.model, messages: [{ role: "user", content: prompt }], stream: false, temperature: 0.8 },
  });
  return r.choices[0].message.content;
}

export async function listImageModels(cfg) {
  const r = await req(cfg, "/api/v1/images/models");
  return (Array.isArray(r) ? r : []).map((m) => m.id).filter(Boolean);
}

export async function imageConfig(cfg) {
  return req(cfg, "/api/v1/images/config");
}

const NEGATIVE = "text, letters, watermark, logo, face, hands, deformed, oversaturated";

export async function generateImage(cfg, hint) {
  const prompt = `${hint}, photographic texture, shallow depth of field, muted desaturated tones, ` +
                 `soft natural light, generous empty space, no text, no people`;
  const body = { prompt, n: 1, negative_prompt: NEGATIVE };
  if (cfg.imageModel) body.model = cfg.imageModel;
  if (cfg.imageSize) body.size = cfg.imageSize;
  const out = await req(cfg, "/api/v1/images/generations", { method: "POST", body });
  const url = out?.[0]?.url;
  if (!url) throw new Error(`이미지 응답 형식이 예상과 다릅니다: ${JSON.stringify(out).slice(0, 200)}`);
  if (url.startsWith("data:")) return Buffer.from(url.split(",", 2)[1], "base64");
  if (url.startsWith("/")) return req(cfg, url, { raw: true });
  return Buffer.from(await (await fetch(url)).arrayBuffer());
}
