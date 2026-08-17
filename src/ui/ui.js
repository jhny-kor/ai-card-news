const $ = (id) => document.getElementById(id);
const FIELDS = ["baseUrl", "apiKey", "model", "imageModel", "cards", "flow", "tone", "outDir",
                "generateImages", "maxGenerate"];
let files = [];
let lastOut = "";

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

  const templates = await window.api.listTemplates();
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
    save();
  });

  // 샘플 질감을 얹어 미리보기 — 템플릿마다 이미지가 어디에 들어가는지 바로 보인다.
  // 실행 후에는 사용자의 1번 카드 문안으로 다시 그린다 (PLAN.md 3.5)
  drawThumbs({ layout: "cover", title: "여기에 제목이 들어갑니다", body: "카드뉴스 표지 미리보기", sample: true },
             templates.map((t) => t.id));

  window.api.onLog(log);
  for (const f of FIELDS) $(f).addEventListener("change", save);
  log("자료를 고르고 '카드뉴스 만들기'를 누르세요.");
}

async function drawThumbs(card, ids) {
  try {
    const shots = await window.api.preview(card, ids);
    for (const [id, uri] of Object.entries(shots)) {
      const img = $(`thumb-${id}`);
      if (img) img.src = uri;
    }
  } catch (e) { log(`미리보기 실패: ${e.message}`); }
}

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
    const ids = [...document.querySelectorAll("#gallery input")].map((i) => i.value);
    drawThumbs({ ...r.cards[0], layout: "cover", sample: true }, ids);   // 갤러리를 내 카드 문안으로 갱신
  } else {
    log(`실패: ${r.error}`);
  }
  $("go").disabled = false;
};

$("openOut").onclick = () => lastOut && window.api.open(lastOut);

init();
