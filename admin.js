/**
 * ======================================================
 * ✅ 여기만 보면 됨: 오너/레포/브랜치/파일경로 하드코딩
 * ======================================================
 */
const OWNER = "BrightAsh";
const REPO = "notice-startpage";
const BRANCH = "main";
const CONTENT_PATH = "content.json"; // repo root에 있는 경우

const API_BASE = "https://api.github.com";

let FILE_SHA = null;     // content.json sha (PUT에 필요)
let STATE = {
  services: [],
  notice: { noticeId: "", items: [] }
};

const $ = (sel) => document.querySelector(sel);

function setStatus(msg, type = "info"){
  const el = $("#status");
  if (!el) return;
  el.innerHTML = `<b>상태:</b> ${msg}`;
  const pill = $("#authPill");
  if (!pill) return;
  if (type === "ok"){
    pill.textContent = "인증 OK";
    pill.className = "pill ok";
  } else if (type === "warn"){
    pill.textContent = "토큰 필요";
    pill.className = "pill warn";
  } else {
    pill.textContent = "대기";
    pill.className = "pill";
  }
}

function setRepoPill(){
  const el = $("#repoPill");
  if (el) el.textContent = `repo: ${OWNER}/${REPO} · ${BRANCH}`;
}

function b64EncodeUnicode(str){
  // Unicode 안전 base64
  return btoa(unescape(encodeURIComponent(str)));
}
function b64DecodeUnicode(b64){
  return decodeURIComponent(escape(atob(b64)));
}

function authHeaders(token){
  // Fine-grained PAT: Bearer 권장
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

async function ghGetContentJson(token){
  const url = `${API_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(CONTENT_PATH)}?ref=${encodeURIComponent(BRANCH)}`;
  const res = await fetch(url, { headers: authHeaders(token) });
  if (!res.ok){
    const text = await res.text().catch(()=> "");
    throw new Error(`GET 실패 (${res.status}) ${text}`);
  }
  const data = await res.json();
  // data.content(base64), data.sha
  return data;
}

async function ghPutContentJson(token, newJsonText, sha){
  const url = `${API_BASE}/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(CONTENT_PATH)}`;
  const body = {
    message: `Update content.json via admin (${new Date().toISOString()})`,
    content: b64EncodeUnicode(newJsonText),
    sha,
    branch: BRANCH
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      ...authHeaders(token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok){
    const text = await res.text().catch(()=> "");
    throw new Error(`PUT 실패 (${res.status}) ${text}`);
  }
  return await res.json();
}

/** =======================
 * UI 렌더링
 * ======================= */
function renderAll(){
  // 기본값 채우기
  $("#noticeId").value = STATE.notice?.noticeId || "";
  $("#shaView").value = FILE_SHA || "";

  renderServices();
  renderNoticeItems();
}

function renderServices(){
  const list = $("#svcList");
  list.innerHTML = "";

  STATE.services.forEach((svc, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";

    const ttl = document.createElement("div");
    ttl.className = "card-title";
    ttl.textContent = `서비스 #${idx+1}`;

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      STATE.services.splice(idx, 1);
      renderServices();
    });

    top.appendChild(ttl);
    top.appendChild(del);

    const grid = document.createElement("div");
    grid.className = "grid2";

    grid.appendChild(makeField("이름(name)", svc.name ?? "", (v)=> svc.name = v));
    grid.appendChild(makeField("URL(url)", svc.url ?? "", (v)=> svc.url = v));
    grid.appendChild(makeField("도메인(domain)", svc.domain ?? "", (v)=> svc.domain = v));

    // note: textarea
    const noteWrap = document.createElement("div");
    noteWrap.style.gridColumn = "1 / -1";
    noteWrap.appendChild(makeTextarea("설명(note) - 줄바꿈 가능", svc.note ?? "", (v)=> svc.note = v));

    // disabled checkbox
    const chkWrap = document.createElement("div");
    chkWrap.style.gridColumn = "1 / -1";
    chkWrap.className = "checkline";
    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.checked = !!svc.disabled;
    chk.addEventListener("change", ()=> svc.disabled = chk.checked);
    const lbl = document.createElement("span");
    lbl.textContent = "비활성(disabled)";

    chkWrap.appendChild(chk);
    chkWrap.appendChild(lbl);

    card.appendChild(top);
    card.appendChild(grid);
    card.appendChild(noteWrap);
    card.appendChild(chkWrap);

    list.appendChild(card);
  });
}

function renderNoticeItems(){
  const list = $("#noticeItems");
  list.innerHTML = "";

  const items = STATE.notice?.items || [];
  items.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    const top = document.createElement("div");
    top.className = "card-top";

    const ttl = document.createElement("div");
    ttl.className = "card-title";
    ttl.textContent = `공지 #${idx+1}`;

    const del = document.createElement("button");
    del.className = "btn danger";
    del.textContent = "삭제";
    del.addEventListener("click", () => {
      items.splice(idx, 1);
      renderNoticeItems();
    });

    top.appendChild(ttl);
    top.appendChild(del);

    const grid = document.createElement("div");
    grid.className = "grid2";

    grid.appendChild(makeField("제목(title)", it.title ?? "", (v)=> it.title = v));
    grid.appendChild(makeField("부제(sub)", it.sub ?? "", (v)=> it.sub = v));

    card.appendChild(top);
    card.appendChild(grid);

    list.appendChild(card);
  });
}

function makeField(labelText, value, onInput){
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.className = "input";
  input.value = value;
  input.addEventListener("input", () => onInput(input.value));
  wrap.appendChild(label);
  wrap.appendChild(input);
  return wrap;
}

function makeTextarea(labelText, value, onInput){
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = labelText;
  const ta = document.createElement("textarea");
  ta.className = "input";
  ta.rows = 5;
  ta.value = value;
  ta.addEventListener("input", () => onInput(ta.value));
  wrap.appendChild(label);
  wrap.appendChild(ta);
  return wrap;
}

/** =======================
 * Load / Save
 * ======================= */
async function handleLoad(){
  const token = $("#token").value.trim();
  if (!token){
    setStatus("토큰이 비어있습니다.", "warn");
    return;
  }

  setStatus("불러오는 중…", "info");

  try{
    const data = await ghGetContentJson(token);
    FILE_SHA = data.sha;

    const jsonText = b64DecodeUnicode(data.content || "");
    const parsed = JSON.parse(jsonText);

    STATE.services = Array.isArray(parsed.services) ? parsed.services : [];
    STATE.notice = parsed.notice || { noticeId: "", items: [] };
    if (!Array.isArray(STATE.notice.items)) STATE.notice.items = [];

    $("#editPanel").style.display = "block";
    $("#loadedPill").textContent = "불러옴";
    $("#loadedPill").className = "pill ok";

    renderAll();
    setStatus(`불러오기 완료 (sha: <span class="mono">${FILE_SHA}</span>)`, "ok");
  }catch(err){
    console.error(err);
    setStatus(`불러오기 실패: ${escapeHtml(err.message)}`, "warn");
  }
}

function collectStateFromUI(){
  // noticeId
  STATE.notice.noticeId = $("#noticeId").value.trim();

  // services / notice.items는 이미 input 이벤트로 반영됨
  // 다만 최소 구조 보장
  if (!Array.isArray(STATE.services)) STATE.services = [];
  if (!STATE.notice || typeof STATE.notice !== "object") STATE.notice = { noticeId: "", items: [] };
  if (!Array.isArray(STATE.notice.items)) STATE.notice.items = [];

  // 불필요한 빈 키 정리는 선택사항(여기선 최소만)
}

async function handleSave(){
  const token = $("#token").value.trim();
  if (!token){
    setStatus("토큰이 비어있습니다.", "warn");
    return;
  }
  if (!FILE_SHA){
    setStatus("먼저 '불러오기'로 기존 파일을 불러와야 저장할 수 있습니다.(sha 필요)", "warn");
    return;
  }

  collectStateFromUI();

  // 최종 JSON 생성
  const payload = {
    services: STATE.services,
    notice: {
      noticeId: STATE.notice.noticeId || "",
      items: STATE.notice.items || []
    }
  };

  // JSON 유효성 (문법 오류 방지)
  let jsonText = "";
  try{
    jsonText = JSON.stringify(payload, null, 2) + "\n";
    JSON.parse(jsonText);
  }catch(err){
    setStatus(`저장 전 JSON 생성 오류: ${escapeHtml(err.message)}`, "warn");
    return;
  }

  setStatus("저장(커밋) 중…", "info");

  try{
    const result = await ghPutContentJson(token, jsonText, FILE_SHA);

    // 저장 성공 시 새 sha로 갱신
    FILE_SHA = result?.content?.sha || FILE_SHA;
    $("#shaView").value = FILE_SHA;

    setStatus(`저장 완료 ✅ (new sha: <span class="mono">${FILE_SHA}</span>)`, "ok");
  }catch(err){
    console.error(err);
    setStatus(`저장 실패: ${escapeHtml(err.message)}`, "warn");
  }
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/** =======================
 * Init
 * ======================= */
document.addEventListener("DOMContentLoaded", () => {
  setRepoPill();
  setStatus("토큰 입력 후 '불러오기'를 누르세요.", "warn");

  $("#btnLoad").addEventListener("click", handleLoad);

  $("#btnAddSvc").addEventListener("click", () => {
    STATE.services.push({
      name: "",
      url: "",
      domain: "",
      note: "",
      disabled: false
    });
    renderServices();
  });

  $("#btnAddNotice").addEventListener("click", () => {
    if (!STATE.notice.items) STATE.notice.items = [];
    STATE.notice.items.push({ title: "", sub: "" });
    renderNoticeItems();
  });

  $("#btnSave").addEventListener("click", handleSave);
});
