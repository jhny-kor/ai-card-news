const $ = (id) => document.getElementById(id);
const FIELDS = ["baseUrl", "apiKey", "model", "imageModel", "cards", "flow", "tone", "outDir",
                "generateImages", "maxGenerate", "font"];
let files = [];
let lastOut = "";
let templates = [];

const val = (el) => (el.type === "checkbox" ? el.checked : el.value);
const setVal = (el, v) => { if (el.type === "checkbox") el.checked = Boolean(v); else el.value = v ?? ""; };

function cfg() {
  const o = {};
  for (const f of FIELDS) o[f] = val($(f));
  o.cards = Number(o.cards) || 6;
  o.maxGenerate = Number(o.maxGenerate) || 3;
  o.template = document.querySelector("#gallery input:checked")?.value || "newspaper";
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
  } else {
    log(`실패: ${r.error}`);
  }
  $("go").disabled = false;
};

$("openOut").onclick = () => lastOut && window.api.open(lastOut);

init();
