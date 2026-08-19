const $ = (id) => document.getElementById(id);
const FIELDS = ["baseUrl", "apiKey", "model", "imageModel", "cards", "flow", "tone", "outDir",
                "generateImages", "maxGenerate", "font"];
let files = [];
let lastOut = "";
let templates = [];
let platforms = [];
let captions = {};
let capTab = "";
let capEdits = {};        // 사용자가 고친 게시 문안(합쳐진 원문 그대로)
const LAYOUTS = ["cover", "statement", "list", "quote", "number", "compare", "closing"];

const val = (el) => (el.type === "checkbox" ? el.checked : el.value);
const setVal = (el, v) => { if (el.type === "checkbox") el.checked = Boolean(v); else el.value = v ?? ""; };

function cfg() {
  const o = {};
  for (const f of FIELDS) o[f] = val($(f));
  o.cards = Number(o.cards) || 6;
  o.maxGenerate = Number(o.maxGenerate) || 3;
  o.template = document.querySelector("#gallery input:checked")?.value || "newspaper";
  o.platforms = [...document.querySelectorAll("#plats input:checked")].map((i) => i.value);
  return o;
}

function log(msg) {
  $("log").textContent += msg + "\n";
  $("log").scrollTop = $("log").scrollHeight;
}

/** select에 목록을 채우고 기존 선택을 유지한다 */
function fill(sel, items, keep) {
  sel.innerHTML = items.map((i) => `<option value="${i}">${i}</option>`).join("");
  if (keep && items.includes(keep)) sel.value = keep;
}

async function init() {
  const s = await window.api.getSettings();
  for (const f of FIELDS) setVal($(f), s[f]);
  if (s.model) fill($("model"), [s.model], s.model);
  if (s.imageModel) fill($("imageModel"), [s.imageModel], s.imageModel);

  platforms = await window.api.listPlatforms();
  const picked = new Set(s.platforms || ["instagram"]);
  $("plats").innerHTML = platforms.map((p) => `
    <label><input type="checkbox" value="${p.id}" ${picked.has(p.id) ? "checked" : ""}>
    ${p.name} <span class="note">${p.max}자 · 태그 ${p.tags[0]}~${p.tags[1]}</span></label>`).join("");
  $("plats").addEventListener("change", save);

  templates = await window.api.listTemplates();
  $("gallery").innerHTML = templates.map((t) => `
    <label data-id="${t.id}" class="${t.id === s.template ? "sel" : ""}">
      <input type="radio" name="tpl" value="${t.id}" ${t.id === s.template ? "checked" : ""}>
      <img id="thumb-${t.id}" alt="">
      <div class="nm">${t.name}</div><div class="ds">${t.desc || ""}</div>
      ${t.image ? `<div class="im">이미지 · ${t.image}</div>` : ""}
    </label>`).join("");
  $("gallery").addEventListener("change", () => {
    document.querySelectorAll("#gallery label").forEach((l) =>
      l.classList.toggle("sel", l.querySelector("input").checked));
    syncFonts();
    save();
    redraw();
  });
  $("font").addEventListener("change", () => { save(); redraw(); });
  syncFonts(s.font);

  // 샘플 질감을 얹어 미리보기 — 템플릿마다 이미지가 어디에 들어가는지 바로 보인다.
  // 실행 후에는 사용자의 1번 카드 문안으로 다시 그린다 (PLAN.md 3.5)
  redraw();

  window.api.onLog(log);
  for (const f of FIELDS) $(f).addEventListener("change", save);
  log("자료를 고르고 '카드뉴스 만들기'를 누르세요.");
}

async function drawThumbs(card, ids) {
  try {
    const shots = await window.api.preview(card, ids, $("font").value);
    for (const [id, uri] of Object.entries(shots)) {
      const img = $(`thumb-${id}`);
      if (img) img.src = uri;
    }
  } catch (e) { log(`미리보기 실패: ${e.message}`); }
}

/** 고른 템플릿이 제공하는 조합만 채운다. 자유 선택을 두면 레이아웃이 깨진다 (lib/fonts.js) */
function syncFonts(keep) {
  const id = document.querySelector("#gallery input:checked")?.value;
  const opts = templates.find((t) => t.id === id)?.fonts || [];
  const want = keep ?? $("font").value;
  $("font").innerHTML = opts.map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
  if (opts.some((f) => f.id === want)) $("font").value = want;
  $("fontNote").textContent = opts.length > 1
    ? `이 템플릿에 어울리는 ${opts.length}가지` : "이 템플릿은 조합이 하나입니다";
}

let previewCard = { layout: "cover", title: "여기에 제목이 들어갑니다", body: "카드뉴스 표지 미리보기", sample: true };
const redraw = () => drawThumbs(previewCard, templates.map((t) => t.id));

/** X는 한글을 2자로 센다. 다른 곳은 글자 수 그대로. */
function capLength(text, p) {
  if (!p?.weighted) return [...text].length;
  const cjk = /[ᄀ-ᇿ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-퟿豈-﫿︰-﹏＀-｠￠-￦]/;
  let n = 0;
  for (const ch of text) n += cjk.test(ch) ? 2 : 1;
  return n;
}

function showCaptions(map) {
  captions = map || {};
  capEdits = {};
  const ids = Object.keys(captions);
  document.querySelector('#tabs button[data-p="caps"]').disabled = !ids.length;
  if (!ids.length) return;
  if (!ids.includes(capTab)) capTab = ids[0];
  $("capTabs").innerHTML = ids.map((id) => {
    const p = platforms.find((x) => x.id === id);
    return `<button data-id="${id}" class="${id === capTab ? "on" : ""}">${p ? p.name : id}</button>`;
  }).join("");
  drawCaption();
}

function drawCaption() {
  const cap = captions[capTab];
  const p = platforms.find((x) => x.id === capTab);
  if (!cap || !p) return;
  const tags = (cap.tags || []).join(" ");
  const full = capEdits[capTab] ?? (tags ? `${cap.text}\n\n${tags}` : cap.text);
  $("capText").value = full;
  const len = capLength(full, p);
  $("capLen").textContent = `${len} / ${p.max}자` + (p.weighted ? " (한글 2자)" : "");
  $("capLen").className = "note" + (len > p.max ? " over" : "");
  $("capHint").textContent = p.fold ? `첫 ${p.fold}자 뒤로는 접힙니다` : "";
}

$("capTabs").addEventListener("click", (e) => {
  const id = e.target.closest("button")?.dataset.id;
  if (!id) return;
  capTab = id;
  document.querySelectorAll("#capTabs button").forEach((b) => b.classList.toggle("on", b.dataset.id === id));
  drawCaption();
});

$("capText").addEventListener("input", () => {
  capEdits[capTab] = $("capText").value;      // 고친 내용을 플랫폼별로 들고 있는다
  drawCaption();
});

$("capSave").onclick = async () => {
  const body = Object.keys(captions).map((id) => {
    const p = platforms.find((x) => x.id === id) || { name: id, max: 0 };
    const cap = captions[id];
    const tags = (cap.tags || []).join(" ");
    const text = capEdits[id] ?? (tags ? `${cap.text}\n\n${tags}` : cap.text);
    return `${"=".repeat(52)}\n${p.name}  (${capLength(text, p)}/${p.max}자)\n${"=".repeat(52)}\n${text}\n`;
  }).join("\n");
  const r = await window.api.saveCaptions(body);
  log(r.ok ? `게시문안.txt 저장` : `저장 실패: ${r.error}`);
};

$("capCopy").onclick = async () => {
  await navigator.clipboard.writeText($("capText").value);
  $("capCopy").textContent = "복사됨";
  setTimeout(() => ($("capCopy").textContent = "복사"), 1200);
};

// ------------------------------------------------------------- 탭

function showTab(name) {
  for (const p of ["log", "cards", "caps"]) $("p-" + p).hidden = p !== name;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.p === name));
}
$("tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b && !b.disabled) showTab(b.dataset.p);
});

// ------------------------------------------------------------- 카드 문안 편집

/** 모델이 약하면 결국 손을 봐야 한다. 여기서 고치면 LLM을 다시 부르지 않는다. */
function showCards(cards) {
  $("cardList").innerHTML = cards.map((c, i) => `
    <div class="card" data-i="${i}">
      <div class="no">${i + 1}</div>
      <select class="layout">${LAYOUTS.map((l) =>
        `<option value="${l}" ${l === c.layout ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="fields">
        <input class="title" value="${esc(c.title || "")}">
        <textarea class="body" rows="${((c.body || "").match(/\n/g) || []).length + 1}">${esc(c.body || "")}</textarea>
        <div class="why"></div>
      </div>
    </div>`).join("");
  document.querySelector('#tabs button[data-p="cards"]').disabled = false;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function collectEdits() {
  return [...document.querySelectorAll("#cardList .card")].map((el) => ({
    layout: el.querySelector(".layout").value,
    title: el.querySelector(".title").value,
    body: el.querySelector(".body").value,
  }));
}

$("recheck").onclick = async () => {
  const edits = collectEdits();
  const issues = await window.api.lint(edits);
  document.querySelectorAll("#cardList .card").forEach((el) => {
    el.querySelector(".title").classList.remove("bad");
    el.querySelector(".body").classList.remove("bad");
    el.querySelector(".why").textContent = "";
  });
  for (const it of issues) {
    const m = /(\d+)번 카드/.exec(it.where || "");
    const el = m ? document.querySelector(`#cardList .card[data-i="${Number(m[1]) - 1}"]`) : null;
    if (!el) continue;
    el.querySelector(".body").classList.add("bad");
    const why = el.querySelector(".why");
    why.textContent = (why.textContent ? why.textContent + " / " : "") + `[${it.id}] ${it.msg.split(".")[0]}`;
  }
  const deck = issues.filter((i) => !/\d+번 카드/.test(i.where || ""));
  $("editNote").textContent = issues.length
    ? `${issues.length}건` + (deck.length ? ` — ${deck.map((d) => d.id).join(", ")}` : "")
    : "AI 티 없음";
};

/** 기계적으로 안전한 것만 코드가 고친다. 편집 중에 눌러도 뜻이 바뀌지 않는다. */
$("autofix").onclick = async () => {
  const { cards, applied } = await window.api.autofix(collectEdits());
  if (!applied.length) return ($("editNote").textContent = "자동으로 고칠 게 없습니다");
  document.querySelectorAll("#cardList .card").forEach((el, i) => {
    el.querySelector(".title").value = cards[i].title || "";
    el.querySelector(".body").value = cards[i].body || "";
  });
  $("editNote").textContent = `${applied.length}건 교정 — ${[...new Set(applied.map((a) => a.why))].join(", ")}`;
};

$("rerender").onclick = async () => {
  $("rerender").disabled = true;
  const r = await window.api.rerender(collectEdits());
  log(r.ok ? `다시 그렸습니다 — ${r.files.length}장` : `다시 그리기 실패: ${r.error}`);
  if (!r.ok) showTab("log");
  $("rerender").disabled = false;
};

const save = () => window.api.setSettings(cfg());

$("pick").onclick = async () => {
  const got = await window.api.pickFiles();
  if (got.length) {
    files = got;
    $("files").textContent = `${files.length}개: ` + files.map((f) => f.split(/[/\\]/).pop()).join(", ");
  }
};

$("pickDir").onclick = async () => {
  const d = await window.api.pickDir();
  if (d) { $("outDir").value = d; save(); }
};

$("loadModels").onclick = async () => {
  try {
    const models = await window.api.listModels(cfg());
    fill($("model"), models, $("model").value);
    log(`문안 모델 ${models.length}개`);
    save();
  } catch (e) { log(`모델 조회 실패: ${e.message}`); }
};

$("loadImage").onclick = async () => {
  try {
    const conf = await window.api.imageConfig(cfg());
    const engine = conf.engine || conf.ENGINE || "(불명)";
    const local = ["comfyui", "automatic1111"].includes(String(engine).toLowerCase());
    $("backend").innerHTML = local
      ? `엔진 <b>${engine}</b> — 로컬. 프롬프트가 밖으로 나가지 않습니다.`
      : `엔진 <b>${engine}</b> — <span class="warn">클라우드일 수 있습니다. 카드 내용이 외부로 전송됩니다.</span>`;
    const models = await window.api.listImageModels(cfg());
    fill($("imageModel"), models, $("imageModel").value);
    log(`이미지 엔진 ${engine}, 모델 ${models.length}개`);
    save();
  } catch (e) {
    $("backend").innerHTML = `<span class="warn">${e.message}</span>`;
    log(`이미지 설정 확인 실패: ${e.message}`);
  }
};

$("go").onclick = async () => {
  if (!files.length) return log("자료 파일을 먼저 선택하세요.");
  $("go").disabled = true;
  $("log").textContent = "";
  await save();
  const r = await window.api.run({ files, cfg: cfg() });
  if (r.ok) {
    lastOut = r.outDir;
    $("openOut").disabled = false;
    previewCard = { ...r.cards[0], layout: "cover", sample: true };     // 갤러리를 내 카드 문안으로 갱신
    redraw();
    showCards(r.cards);
    showCaptions(r.captions);
    showTab("cards");        // 손볼 게 있으면 바로 보이도록
  } else {
    log(`실패: ${r.error}`);
  }
  $("go").disabled = false;
};

$("openOut").onclick = () => lastOut && window.api.open(lastOut);

init();
