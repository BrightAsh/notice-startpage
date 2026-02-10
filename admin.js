// ===== 고정 설정(여기에 오너/레포/브랜치 박기) =====
const OWNER = "BrightAsh";
const REPO = "notice-startpage";
const BRANCH = "main";
const FILE_PATH = "content.json";

// ===== DOM helpers =====
const $ = (id) => document.getElementById(id);

function setMsg(text, kind = "") {
  const el = $("msg");
  el.className = "msg" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function setSaveMsg(text, kind = "") {
  const el = $("saveMsg");
  el.className = "msg" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function requireEl(id) {
  const el = $(id);
  if (!el) throw new Error(`admin.html에 #${id} 요소가 없습니다. (id 불일치)`);
  return el;
}

// ===== base64 utf-8 =====
function b64ToUtf8(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// ===== GitHub API =====
function ghHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": `Bearer ${token}`, // fine-grained 권장
  };
}

const GH_GET_URL = () =>
  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(FILE_PATH)}?ref=${encodeURIComponent(BRANCH)}`;

const GH_PUT_URL = () =>
  `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(FILE_PATH)}`;

// ===== state =====
let loadedSha = null;     // 불러오기 성공 시 sha 저장
let loadedData = null;    // 현재 편집중 데이터

// ===== UI render =====
function serviceCardTemplate(s, idx) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.idx = String(idx);

  card.innerHTML = `
    <div class="card-hd">
      <div class="card-title">서비스 #${idx + 1}</div>
      <button class="btn" data-act="delSvc">삭제</button>
    </div>

    <div class="grid2">
      <div>
        <label>name</label>
        <input type="text" data-k="name" value="${escapeHtml(s.name || "")}" />
      </div>
      <div>
        <label>domain</label>
        <input type="text" data-k="domain" value="${escapeHtml(s.domain || "")}" placeholder="예: chatgpt.com" />
      </div>
    </div>

    <div class="grid2">
      <div>
        <label>url</label>
        <input type="text" data-k="url" value="${escapeHtml(s.url || "")}" placeholder="https://..." />
      </div>
      <div class="check">
        <input type="checkbox" data-k="disabled" ${s.disabled ? "checked" : ""} />
        <span>disabled</span>
      </div>
    </div>

    <div style="margin-top:10px;">
      <label>note (줄바꿈 유지)</label>
      <textarea data-k="note">${escapeHtml(s.note || "")}</textarea>
    </div>
  `;
  return card;
}

function noticeCardTemplate(it, idx) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.idx = String(idx);

  card.innerHTML = `
    <div class="card-hd">
      <div class="card-title">공지 #${idx + 1}</div>
      <button class="btn" data-act="delNotice">삭제</button>
    </div>

    <div class="grid2">
      <div>
        <label>title</label>
        <input type="text" data-k="title" value="${escapeHtml(it.title || "")}" />
      </div>
      <div>
        <label>sub</label>
        <input type="text" data-k="sub" value="${escapeHtml(it.sub || "")}" />
      </div>
    </div>
  `;
  return card;
}

// XSS 방지용(간단)
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAll() {
  requireEl("editor").classList.remove("hidden");

  // services
  const svcList = requireEl("svcList");
  svcList.innerHTML = "";
  (loadedData.services || []).forEach((s, i) => svcList.appendChild(serviceCardTemplate(s, i)));

  // notice
  requireEl("noticeId").value = loadedData.notice?.noticeId || "";
  const noticeList = requireEl("noticeList");
  noticeList.innerHTML = "";
  (loadedData.notice?.items || []).forEach((it, i) => noticeList.appendChild(noticeCardTemplate(it, i)));
}

function collectDataFromForm() {
  const services = [];
  const svcCards = requireEl("svcList").querySelectorAll(".card");
  svcCards.forEach((card) => {
    const get = (k) => card.querySelector(`[data-k="${k}"]`);
    services.push({
      name: get("name")?.value?.trim() || "",
      url: get("url")?.value?.trim() || "",
      domain: get("domain")?.value?.trim() || "",
      note: get("note")?.value ?? "",
      disabled: !!get("disabled")?.checked,
    });
  });

  const noticeId = requireEl("noticeId").value.trim();
  const items = [];
  const ntCards = requireEl("noticeList").querySelectorAll(".card");
  ntCards.forEach((card) => {
    const get = (k) => card.querySelector(`[data-k="${k}"]`);
    items.push({
      title: get("title")?.value?.trim() || "",
      sub: get("sub")?.value?.trim() || "",
    });
  });

  return {
    services,
    notice: { noticeId, items },
  };
}

// ===== actions =====
async function loadContentWithToken(token) {
  const res = await fetch(GH_GET_URL(), { headers: ghHeaders(token) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`불러오기 실패: ${res.status} ${res.statusText}\n${t}`);
  }

  const json = await res.json();
  if (!json?.content || !json?.sha) {
    throw new Error("GitHub 응답에 content/sha가 없습니다. (경로/브랜치 확인 필요)");
  }

  const text = b64ToUtf8(json.content.replace(/\n/g, ""));
  const data = JSON.parse(text);

  loadedSha = json.sha;
  loadedData = {
    services: Array.isArray(data.services) ? data.services : [],
    notice: data.notice || { noticeId: "", items: [] },
  };

  return true;
}

async function saveContentWithToken(token, newData) {
  if (!loadedSha) throw new Error("먼저 '불러오기'를 해서 sha를 확보해야 저장할 수 있습니다.");

  const body = {
    message: requireEl("commitMsg").value.trim() || "Update content.json via admin",
    content: utf8ToB64(JSON.stringify(newData, null, 2)),
    sha: loadedSha,
    branch: BRANCH,
  };

  const res = await fetch(GH_PUT_URL(), {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`저장 실패: ${res.status} ${res.statusText}\n${t}`);
  }

  const out = await res.json();
  // 저장 후 sha 갱신
  loadedSha = out?.content?.sha || loadedSha;
  return true;
}

// ===== init =====
document.addEventListener("DOMContentLoaded", () => {
  // repo pill
  const pill = $("repoPill");
  if (pill) pill.textContent = `repo: ${OWNER}/${REPO} (${BRANCH})`;

  // 버튼/필드 존재 검증(여기서 안 터지면 id 불일치 문제는 거의 해결)
  requireEl("ghToken");
  requireEl("btnLoad");
  requireEl("btnAddSvc");
  requireEl("btnAddNotice");
  requireEl("btnSave");

  $("ghToken").addEventListener("input", () => {
    const v = $("ghToken").value.trim();
    $("tokenState").textContent = v ? "입력됨" : "토큰 필요";
  });

  $("btnLoad").addEventListener("click", async () => {
    setMsg("");
    setSaveMsg("");
    const token = $("ghToken").value.trim();
    if (!token) return setMsg("토큰을 입력하세요.", "err");

    try {
      await loadContentWithToken(token);
      renderAll();
      setMsg("불러오기 완료. 수정 후 저장하세요.", "ok");
    } catch (e) {
      console.error(e);
      setMsg(String(e.message || e), "err");
    }
  });

  $("btnAddSvc").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] } };
    loadedData.services.push({ name: "", url: "", domain: "", note: "", disabled: false });
    renderAll();
  });

  $("svcList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act='delSvc']");
    if (!btn) return;
    const card = btn.closest(".card");
    const idx = Number(card?.dataset?.idx);
    if (!Number.isFinite(idx)) return;
    loadedData.services.splice(idx, 1);
    renderAll();
  });

  $("btnAddNotice").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] } };
    if (!loadedData.notice) loadedData.notice = { noticeId: "", items: [] };
    loadedData.notice.items.push({ title: "", sub: "" });
    renderAll();
  });

  $("noticeList").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act='delNotice']");
    if (!btn) return;
    const card = btn.closest(".card");
    const idx = Number(card?.dataset?.idx);
    if (!Number.isFinite(idx)) return;
    loadedData.notice.items.splice(idx, 1);
    renderAll();
  });

  $("btnSave").addEventListener("click", async () => {
    setSaveMsg("");
    const token = $("ghToken").value.trim();
    if (!token) return setSaveMsg("토큰을 입력하세요.", "err");

    try {
      const newData = collectDataFromForm();

      if (!newData.notice.noticeId) {
        return setSaveMsg("noticeId(기준일)를 입력하세요.", "err");
      }

      await saveContentWithToken(token, newData);
      setSaveMsg("저장(커밋) 완료. 메인 페이지 새로고침하면 반영됩니다.", "ok");
    } catch (e) {
      console.error(e);
      setSaveMsg(String(e.message || e), "err");
    }
  });
});
