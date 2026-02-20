// ===== 고정 설정 =====
const OWNER = "BrightAsh";
const REPO = "notice-startpage";
const BRANCH = "main";
const FILE_PATH = "content.json";
const FILES_DIR = "files";

// Prompt Guide (고정 PDF: 교체만, 삭제 없음)
const PROMPT_PDF_NAME = "Prompt.pdf";
const PROMPT_PDF_PATH = `${FILES_DIR}/${PROMPT_PDF_NAME}`;

// ===== DOM helpers =====
const $ = (id) => document.getElementById(id);

function setMsg(text, kind = "") {
  const el = $("msg");
  if (!el) return;
  el.className = "msg" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function setSaveMsg(text, kind = "") {
  const el = $("saveMsg");
  if (!el) return;
  el.className = "msg" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function requireEl(id) {
  const el = $(id);
  if (!el) throw new Error(`admin.html에 #${id} 요소가 없습니다. (id 불일치)`);
  return el;
}

// ===== util: XSS escape(간단) =====
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function norm(s) { return String(s ?? "").trim(); }
function pdfNameForService(serviceName) {
  const n = norm(serviceName);
  return n ? `${n}.pdf` : "";
}

// ===== deep clone =====
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ===== base64 (UTF-8) =====
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ===== base64 (binary/PDF) =====
function arrayBufferToB64(buf) {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
async function fileToB64(file) {
  const buf = await file.arrayBuffer();
  return arrayBufferToB64(buf);
}

// ===== UID =====
function makeUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "uid_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}
function ensureServiceUids(services) {
  (services || []).forEach((s) => { if (!s._uid) s._uid = makeUid(); });
  return services;
}
function ensureNoticeItemUids(items) {
  (items || []).forEach((it) => { if (!it._uid) it._uid = makeUid(); });
  return items;
}

// ===== GitHub REST =====
function ghRestHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${token}`,
  };
}
function ghRestContentUrl(path) {
  const p = String(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${p}`;
}
const REST_GET_CONTENT = (path) => `${ghRestContentUrl(path)}?ref=${encodeURIComponent(BRANCH)}`;

// ===== GitHub GraphQL =====
async function ghGraphQL(token, query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = json?.message || `${res.status} ${res.statusText}`;
    throw new Error(`GraphQL HTTP 오류: ${msg}`);
  }
  if (json?.errors?.length) {
    const e0 = json.errors[0];
    throw new Error(`GraphQL 오류: ${e0?.message || "unknown"}`);
  }
  return json.data;
}

async function getBranchHeadOid(token) {
  const q = `
    query($owner:String!, $name:String!, $ref:String!){
      repository(owner:$owner, name:$name){
        ref(qualifiedName:$ref){
          target{ ... on Commit { oid } }
        }
      }
    }
  `;
  const data = await ghGraphQL(token, q, {
    owner: OWNER,
    name: REPO,
    ref: `refs/heads/${BRANCH}`,
  });
  const oid = data?.repository?.ref?.target?.oid;
  if (!oid) throw new Error("브랜치 HEAD OID를 가져오지 못했습니다. (브랜치/권한 확인)");
  return oid;
}

async function createSingleCommit(token, headline, additions, deletions) {
  const mutation = `
    mutation($input: CreateCommitOnBranchInput!){
      createCommitOnBranch(input: $input){
        commit { oid url }
      }
    }
  `;

  const expectedHeadOid = await getBranchHeadOid(token);

  const input = {
    branch: {
      repositoryNameWithOwner: `${OWNER}/${REPO}`,
      branchName: BRANCH,
    },
    message: { headline: headline || "Update via admin", body: "" },
    expectedHeadOid,
    fileChanges: { additions, deletions },
  };

  const data = await ghGraphQL(token, mutation, { input });
  const commit = data?.createCommitOnBranch?.commit;
  if (!commit?.oid) throw new Error("커밋 생성 결과를 확인하지 못했습니다.");
  return commit;
}

// ===== 상태 =====
let loadedSha = null;
let loadedData = null;

let filesIndex = new Set();
let filesIndexLoaded = false;

// 서비스별 PDF 스테이징
const stagedPdfOps = new Map();

// Prompt PDF 스테이징(교체만)
let stagedPromptPdfOp = null;

// 원본 스냅샷(변경현황 계산용)
let originalSvcByUid = new Map();
let originalNoticeByUid = new Map();
let originalNoticeId = "";

// baseline(되돌리기용)
let baselineData = null;

// ===== Reset button state =====
function setResetButtonState(disabled) {
  const btn = document.getElementById("btnResetEdits");
  if (btn) btn.disabled = !!disabled;
}

// ===== 접기 카드 템플릿 =====
function serviceSummaryText(idx, name) {
  const n = norm(name);
  return n ? `서비스 #${idx + 1} · ${n}` : `서비스 #${idx + 1}`;
}
function noticeSummaryText(idx, title) {
  const t = norm(title);
  return t ? `공지 #${idx + 1} · ${t}` : `공지 #${idx + 1}`;
}

function serviceCardTemplate(s, idx) {
  const card = document.createElement("details");
  card.className = "card";
  card.dataset.idx = String(idx);
  card.dataset.uid = String(s._uid);
  card.open = false;

  card.innerHTML = `
    <summary class="card-summary">
      <span class="sum-title">${escapeHtml(serviceSummaryText(idx, s.name))}</span>
      <span class="sum-right">
        <span class="sum-actions">
          <button type="button" class="btn sum-btn" data-act="delSvcQuick">서비스 삭제</button>
          <button type="button" class="btn sum-btn" data-act="attachPdfQuick">PDF 첨부</button>
          <button type="button" class="btn sum-btn danger" data-act="delPdfQuick">PDF 삭제</button>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </span>
    </summary>

    <div class="card-body">
      <div class="card-hd" style="margin-bottom:10px;">
        <div class="card-title">편집</div>
        <button class="btn" data-act="delSvc">서비스 삭제</button>
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

      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <div style="flex:1;min-width:240px;font-size:12px;color:var(--muted);">
          소개 PDF: <span data-k="pdfState">확인중…</span>
        </div>
        <input type="file" accept="application/pdf" data-k="pdfInput" style="display:none" />
        <button class="btn" data-act="attachPdf">PDF 첨부</button>
        <button class="btn danger" data-act="delPdf">PDF 삭제</button>
      </div>
    </div>
  `;
  return card;
}

function noticeCardTemplate(it, idx) {
  const card = document.createElement("details");
  card.className = "card";
  card.dataset.idx = String(idx);
  card.dataset.uid = String(it._uid || "");
  card.open = false;

  card.innerHTML = `
    <summary class="card-summary">
      <span class="sum-title">${escapeHtml(noticeSummaryText(idx, it.title))}</span>
      <span class="sum-right">
        <span class="sum-actions">
          <button type="button" class="btn sum-btn" data-act="delNoticeQuick">공지 삭제</button>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </span>
    </summary>

    <div class="card-body">
      <div class="card-hd" style="margin-bottom:10px;">
        <div class="card-title">편집</div>
        <button class="btn" data-act="delNotice">공지 삭제</button>
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
    </div>
  `;
  return card;
}

// ===== 렌더 =====
function renderAll() {
  requireEl("editor").classList.remove("hidden");

  const svcList = requireEl("svcList");
  svcList.innerHTML = "";
  (loadedData.services || []).forEach((s, i) => svcList.appendChild(serviceCardTemplate(s, i)));

  requireEl("noticeId").value = loadedData.notice?.noticeId || "";
  const ntList = requireEl("noticeList");
  ntList.innerHTML = "";
  (loadedData.notice?.items || []).forEach((it, i) => ntList.appendChild(noticeCardTemplate(it, i)));

  refreshAllCardsPdfUI();
  refreshPromptPdfUI();
  updatePendingSummary();
}

// ===== 폼 스냅샷 =====
function snapshotFromFormWithUids() {
  const services = [];
  const svcCards = requireEl("svcList").querySelectorAll(".card");
  svcCards.forEach((card) => {
    const uid = card.dataset.uid || makeUid();
    const get = (k) => card.querySelector(`[data-k="${k}"]`);
    services.push({
      _uid: uid,
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
    const uid = card.dataset.uid || makeUid();
    items.push({
      _uid: uid,
      title: get("title")?.value?.trim() || "",
      sub: get("sub")?.value?.trim() || "",
    });
  });

  return { services, notice: { noticeId, items } };
}

function stripInternalFields(dataWithUids) {
  return {
    services: (dataWithUids.services || []).map((s) => ({
      name: s.name || "",
      url: s.url || "",
      domain: s.domain || "",
      note: s.note ?? "",
      ...(s.disabled ? { disabled: true } : {}),
    })),
    notice: {
      noticeId: dataWithUids.notice?.noticeId || "",
      items: (dataWithUids.notice?.items || []).map((it) => ({
        title: it.title || "",
        sub: it.sub || "",
      })),
    },
  };
}

// ===== 로드 =====
async function loadContentJson(token) {
  const res = await fetch(REST_GET_CONTENT(FILE_PATH), { headers: ghRestHeaders(token) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`불러오기 실패(content.json): ${res.status} ${res.statusText}\n${t}`);
  }
  const json = await res.json();
  loadedSha = json?.sha || null;

  const text = b64ToUtf8(String(json?.content || "").replace(/\n/g, ""));
  const parsed = JSON.parse(text);

  const services = ensureServiceUids(Array.isArray(parsed.services) ? parsed.services : []);
  const notice = parsed.notice || { noticeId: "", items: [] };
  notice.items = ensureNoticeItemUids(Array.isArray(notice.items) ? notice.items : []);

  loadedData = { services, notice };

  // baseline 저장(불러오기 직후)
  baselineData = deepClone(loadedData);

  // 원본 스냅샷(변경현황 기준)
  originalSvcByUid = new Map();
  services.forEach((s) => {
    originalSvcByUid.set(String(s._uid), {
      name: s.name || "",
      url: s.url || "",
      domain: s.domain || "",
      note: s.note ?? "",
      disabled: !!s.disabled,
    });
  });

  originalNoticeId = notice.noticeId || "";
  originalNoticeByUid = new Map();
  (notice.items || []).forEach((it) => {
    originalNoticeByUid.set(String(it._uid), { title: it.title || "", sub: it.sub || "" });
  });

  stagedPdfOps.clear();
  stagedPromptPdfOp = null;

  return true;
}

async function loadFilesDirIndex(token) {
  filesIndex = new Set();
  filesIndexLoaded = false;

  const res = await fetch(REST_GET_CONTENT(FILES_DIR), { headers: ghRestHeaders(token) });
  if (res.status === 404) {
    filesIndexLoaded = true;
    return true;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`불러오기 실패(files/): ${res.status} ${res.statusText}\n${t}`);
  }

  const arr = await res.json();
  if (Array.isArray(arr)) {
    arr.forEach((it) => {
      if (it?.type === "file" && typeof it?.name === "string" && /\.pdf$/i.test(it.name)) {
        filesIndex.add(it.name);
      }
    });
  }
  filesIndexLoaded = true;
  return true;
}

// ===== Prompt PDF =====
function refreshPromptPdfUI() {
  const statusEl = document.getElementById("promptPdfStatus");
  const btn = document.getElementById("btnPromptPdfReplace");
  if (!statusEl && !btn) return;

  const tokenOk = !!norm($("ghToken")?.value);
  const exists = filesIndexLoaded && filesIndex.has(PROMPT_PDF_NAME);

  if (btn) {
    btn.disabled = !tokenOk || !filesIndexLoaded;
    btn.textContent = "PDF 교체";
  }

  if (!statusEl) return;
  if (!filesIndexLoaded) {
    statusEl.textContent = "확인중…";
    return;
  }
  if (stagedPromptPdfOp?.type === "upsert") {
    statusEl.textContent = exists ? "저장 대기(교체)" : "저장 대기(업로드)";
    return;
  }
  statusEl.textContent = exists ? `현재 파일: ${PROMPT_PDF_NAME}` : "현재 파일 없음";
}

function wirePromptPdfControls() {
  const btn = document.getElementById("btnPromptPdfReplace");
  const input = document.getElementById("promptPdfInput");
  if (!btn || !input) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const tokenOk = !!norm($("ghToken")?.value);
    if (!tokenOk) return setMsg("토큰을 입력하세요.", "err");
    if (!filesIndexLoaded) return setMsg("files/ 목록을 불러오는 중입니다. 잠시 후 다시 시도하세요.", "err");
    input.click();
  });

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      setMsg(`Prompt PDF 읽는 중(저장 대기): ${file.name} → ${PROMPT_PDF_NAME}`, "");
      const b64 = await fileToB64(file);

      stagedPromptPdfOp = { type: "upsert", b64, size: file.size, origName: file.name };
      refreshPromptPdfUI();
      updatePendingSummary();
      setMsg(`Prompt PDF 저장 대기: ${PROMPT_PDF_NAME} (저장 필요)`, "ok");
    } catch (e) {
      console.error(e);
      setMsg(String(e.message || e), "err");
    }
  });
}

// ===== Reset: baseline 복구 =====
function resetEditsToBaseline() {
  if (!baselineData) return;

  stagedPdfOps.clear();
  stagedPromptPdfOp = null;

  loadedData = deepClone(baselineData);

  // 원본 비교용 스냅샷도 baseline 기준으로 재구성
  originalSvcByUid = new Map();
  (loadedData.services || []).forEach((s) => {
    originalSvcByUid.set(String(s._uid), {
      name: s.name || "",
      url: s.url || "",
      domain: s.domain || "",
      note: s.note ?? "",
      disabled: !!s.disabled,
    });
  });

  originalNoticeId = loadedData.notice?.noticeId || "";
  originalNoticeByUid = new Map();
  (loadedData.notice?.items || []).forEach((it) => {
    originalNoticeByUid.set(String(it._uid), { title: it.title || "", sub: it.sub || "" });
  });

  renderAll();
  setSaveMsg("");
  setMsg("수정 사항이 초기화되었습니다.", "ok");
}

// ===== PDF UI(서비스별) =====
function getPdfUiState(uid, serviceName) {
  const name = norm(serviceName);
  const fileName = pdfNameForService(name);
  const repoHas = !!fileName && filesIndex.has(fileName);
  const staged = stagedPdfOps.get(uid) || null;
  return { name, fileName, repoHas, staged };
}

function refreshAllCardsPdfUI() {
  const cards = document.querySelectorAll("#svcList .card");
  cards.forEach((card) => refreshCardPdfUI(card));
}

function refreshCardPdfUI(card) {
  const uid = card.dataset.uid;
  const name = card.querySelector('input[data-k="name"]')?.value || "";
  const tokenOk = !!norm($("ghToken")?.value);

  const stateEl = card.querySelector('.card-body [data-k="pdfState"]');
  const bodyAttach = card.querySelector('.card-body button[data-act="attachPdf"]');
  const bodyDel = card.querySelector('.card-body button[data-act="delPdf"]');

  const quickSvcDel = card.querySelector('summary button[data-act="delSvcQuick"]');
  const quickAttach = card.querySelector('summary button[data-act="attachPdfQuick"]');
  const quickDel = card.querySelector('summary button[data-act="delPdfQuick"]');

  if (!stateEl || !bodyAttach || !bodyDel || !quickSvcDel || !quickAttach || !quickDel) return;

  quickSvcDel.disabled = !tokenOk;

  if (!norm(name)) {
    stateEl.textContent = "name을 입력하면 PDF를 첨부할 수 있어요.";

    bodyAttach.textContent = "PDF 첨부";
    bodyAttach.disabled = true;
    bodyDel.style.display = "none";

    quickAttach.textContent = "PDF 첨부";
    quickAttach.disabled = true;
    quickDel.style.display = "none";
    return;
  }

  if (!filesIndexLoaded) {
    stateEl.textContent = "확인중…";

    bodyAttach.disabled = true;
    bodyDel.style.display = "none";

    quickAttach.disabled = true;
    quickDel.style.display = "none";
    return;
  }

  const { fileName, repoHas, staged } = getPdfUiState(uid, name);

  const attachLabel = staged?.type === "upsert"
    ? "PDF 다시 선택(저장 대기)"
    : (repoHas ? "PDF 교체(덮어쓰기)" : "PDF 첨부");

  bodyAttach.textContent = attachLabel;
  bodyAttach.disabled = !tokenOk;

  quickAttach.textContent = attachLabel.replace("(덮어쓰기)", "").trim();
  quickAttach.disabled = !tokenOk;

  if (staged?.type === "delete") {
    stateEl.textContent = repoHas ? `삭제 예정: ${fileName}` : `삭제 예정(원본 없음): ${fileName}`;

    bodyDel.style.display = "";
    bodyDel.textContent = "삭제 취소";
    bodyDel.disabled = !tokenOk;

    quickDel.style.display = "";
    quickDel.textContent = "삭제 취소";
    quickDel.disabled = !tokenOk;
    return;
  }

  if (staged?.type === "upsert") {
    stateEl.textContent = repoHas ? `저장 대기(교체): ${fileName}` : `저장 대기(첨부): ${fileName}`;

    bodyDel.style.display = "";
    bodyDel.textContent = "PDF 삭제";
    bodyDel.disabled = !tokenOk;

    quickDel.style.display = repoHas ? "" : "none";
    quickDel.textContent = "PDF 삭제";
    quickDel.disabled = !tokenOk;
    return;
  }

  if (repoHas) {
    stateEl.textContent = `연결됨: ${fileName}`;

    bodyDel.style.display = "";
    bodyDel.textContent = "PDF 삭제";
    bodyDel.disabled = !tokenOk;

    quickDel.style.display = "";
    quickDel.textContent = "PDF 삭제";
    quickDel.disabled = !tokenOk;
  } else {
    stateEl.textContent = `없음: ${fileName}`;
    bodyDel.style.display = "none";
    quickDel.style.display = "none";
  }
}

// ===== 커밋 파일 변경 =====
function buildFileChangesForCommit(dataWithUids) {
  const cleanData = stripInternalFields(dataWithUids);
  const contentJsonB64 = utf8ToB64(JSON.stringify(cleanData, null, 2));

  const additions = [{ path: FILE_PATH, contents: contentJsonB64 }];
  const deletionPaths = new Set();
  const additionPaths = new Set([FILE_PATH]);

  const curSvcByUid = new Map((dataWithUids.services || []).map((s) => [String(s._uid), s]));
  const curNameSet = new Set();
  (dataWithUids.services || []).forEach((s) => { if (norm(s.name)) curNameSet.add(norm(s.name)); });

  for (const [uid, op] of stagedPdfOps.entries()) {
    const svc = curSvcByUid.get(String(uid));
    const svcName = norm(svc?.name);
    const fileName = pdfNameForService(svcName);
    const path = fileName ? `${FILES_DIR}/${fileName}` : "";

    if (op?.type === "upsert") {
      if (!path) continue;
      additions.push({ path, contents: op.b64 });
      additionPaths.add(path);
      continue;
    }
    if (op?.type === "delete") {
      if (!path) continue;
      if (filesIndex.has(fileName)) deletionPaths.add(path);
      continue;
    }
  }

  if (stagedPromptPdfOp?.type === "upsert") {
    additions.push({ path: PROMPT_PDF_PATH, contents: stagedPromptPdfOp.b64 });
    additionPaths.add(PROMPT_PDF_PATH);
  }

  for (const [uid, orig] of originalSvcByUid.entries()) {
    if (curSvcByUid.has(String(uid))) continue;

    const oldName = norm(orig?.name);
    if (!oldName) continue;
    if (curNameSet.has(oldName)) continue;

    const oldFile = `${oldName}.pdf`;
    if (!filesIndex.has(oldFile)) continue;

    deletionPaths.add(`${FILES_DIR}/${oldFile}`);
  }

  for (const p of Array.from(deletionPaths)) {
    if (additionPaths.has(p)) deletionPaths.delete(p);
  }

  const deletions = Array.from(deletionPaths).map((p) => ({ path: p }));
  return { additions, deletions };
}

// ===== 변경현황 =====
function isServiceChanged(orig, cur) {
  const a = (v) => norm(v);
  return (
    a(orig.name) !== a(cur.name) ||
    a(orig.url) !== a(cur.url) ||
    a(orig.domain) !== a(cur.domain) ||
    String(orig.note ?? "") !== String(cur.note ?? "") ||
    !!orig.disabled !== !!cur.disabled
  );
}
function isNoticeChanged(orig, cur) {
  const a = (v) => norm(v);
  return a(orig.title) !== a(cur.title) || a(orig.sub) !== a(cur.sub);
}

function updatePendingSummary() {
  const setNum = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };

  const legacy = document.getElementById("pendingSummary");
  const editor = document.getElementById("editor");
  if (!editor || editor.classList.contains("hidden") || !loadedData) {
    setNum("p_pdf_total", 0); setNum("p_pdf_attach", 0); setNum("p_pdf_replace", 0); setNum("p_pdf_delete", 0);
    setNum("p_svc_total", 0); setNum("p_svc_add", 0); setNum("p_svc_mod", 0); setNum("p_svc_del", 0);
    setNum("p_nt_total", 0);  setNum("p_nt_add", 0);  setNum("p_nt_mod", 0);  setNum("p_nt_del", 0);
    if (legacy) legacy.textContent = "-";
    setResetButtonState(true);
    return;
  }

  const snap = snapshotFromFormWithUids();

  // PDF
  let pdfAttach = 0, pdfReplace = 0, pdfDelete = 0;
  const curSvcByUid = new Map((snap.services || []).map((s) => [String(s._uid), s]));
  for (const [uid, op] of stagedPdfOps.entries()) {
    const svc = curSvcByUid.get(String(uid));
    const svcName = norm(svc?.name);
    const fileName = pdfNameForService(svcName);

    if (op?.type === "upsert") {
      if (fileName && filesIndex.has(fileName)) pdfReplace += 1;
      else pdfAttach += 1;
    } else if (op?.type === "delete") {
      pdfDelete += 1;
    }
  }
  if (stagedPromptPdfOp?.type === "upsert") {
    if (filesIndex.has(PROMPT_PDF_NAME)) pdfReplace += 1;
    else pdfAttach += 1;
  }
  const pdfTotal = pdfAttach + pdfReplace + pdfDelete;

  // 서비스
  let svcAdd = 0, svcMod = 0, svcDel = 0;
  for (const [uid, cur] of curSvcByUid.entries()) {
    const orig = originalSvcByUid.get(String(uid));
    if (!orig) svcAdd += 1;
    else if (isServiceChanged(orig, cur)) svcMod += 1;
  }
  for (const uid of originalSvcByUid.keys()) {
    if (!curSvcByUid.has(String(uid))) svcDel += 1;
  }
  const svcTotal = svcAdd + svcMod + svcDel;

  // 공지
  const curNtByUid = new Map(((snap.notice?.items) || []).map((it) => [String(it._uid), it]));
  let ntAdd = 0, ntMod = 0, ntDel = 0;

  for (const [uid, cur] of curNtByUid.entries()) {
    const orig = originalNoticeByUid.get(String(uid));
    if (!orig) ntAdd += 1;
    else if (isNoticeChanged(orig, cur)) ntMod += 1;
  }
  for (const uid of originalNoticeByUid.keys()) {
    if (!curNtByUid.has(String(uid))) ntDel += 1;
  }
  if (norm(snap.notice?.noticeId) !== norm(originalNoticeId)) ntMod += 1;
  const ntTotal = ntAdd + ntMod + ntDel;

  setNum("p_pdf_total", pdfTotal);
  setNum("p_pdf_attach", pdfAttach);
  setNum("p_pdf_replace", pdfReplace);
  setNum("p_pdf_delete", pdfDelete);

  setNum("p_svc_total", svcTotal);
  setNum("p_svc_add", svcAdd);
  setNum("p_svc_mod", svcMod);
  setNum("p_svc_del", svcDel);

  setNum("p_nt_total", ntTotal);
  setNum("p_nt_add", ntAdd);
  setNum("p_nt_mod", ntMod);
  setNum("p_nt_del", ntDel);

  if (legacy) {
    legacy.textContent =
      `PDF ${pdfTotal}(첨부${pdfAttach}/교체${pdfReplace}/삭제${pdfDelete}) · ` +
      `서비스 ${svcTotal}(추가${svcAdd}/수정${svcMod}/삭제${svcDel}) · ` +
      `공지 ${ntTotal}(추가${ntAdd}/수정${ntMod}/삭제${ntDel})`;
  }

  // ✅ 여기! totals 계산이 끝난 뒤에만 쓸 수 있음
  setResetButtonState((pdfTotal + svcTotal + ntTotal) === 0);
}

// ===== init =====
document.addEventListener("DOMContentLoaded", () => {
  const pill = $("repoPill");
  if (pill) pill.textContent = `repo: ${OWNER}/${REPO} (${BRANCH})`;

  const btnReset = document.getElementById("btnResetEdits");
  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetEditsToBaseline();
    });
  }

  requireEl("ghToken");
  requireEl("btnLoad");
  requireEl("btnAddSvc");
  requireEl("btnAddNotice");
  requireEl("btnSave");

  wirePromptPdfControls();

  $("ghToken").addEventListener("input", () => {
    const v = norm($("ghToken").value);
    $("tokenState").textContent = v ? "입력됨" : "토큰 필요";
    refreshAllCardsPdfUI();
    refreshPromptPdfUI();
    updatePendingSummary(); // 여기서 reset 버튼 상태도 같이 갱신됨
  });

  $("btnLoad").addEventListener("click", async () => {
    setMsg("");
    setSaveMsg("");

    const token = norm($("ghToken").value);
    if (!token) return setMsg("토큰을 입력하세요.", "err");

    try {
      setMsg("불러오는 중...", "");
      await loadContentJson(token);
      await loadFilesDirIndex(token);
      renderAll();
      setMsg("불러오기 완료. 수정 후 '저장'하면 한 번에 커밋됩니다.", "ok");
    } catch (e) {
      console.error(e);
      setMsg(String(e.message || e), "err");
    }
  });

  $("btnAddSvc").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] } };
    if (!requireEl("editor").classList.contains("hidden")) {
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
    }
    loadedData.services.push({ _uid: makeUid(), name: "", url: "", domain: "", note: "", disabled: false });
    renderAll();
  });

  $("btnAddNotice").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] } };
    const snap = snapshotFromFormWithUids();
    loadedData.services = ensureServiceUids(snap.services);
    loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
    if (!loadedData.notice) loadedData.notice = { noticeId: "", items: [] };
    loadedData.notice.items.push({ _uid: makeUid(), title: "", sub: "" });
    renderAll();
  });

  // ✅ 서비스 리스트 click
  $("svcList").addEventListener("click", async (e) => {
    if (e.target.closest("button[data-act]")) {
      e.preventDefault();
      e.stopPropagation();
    }

    const token = norm($("ghToken").value);
    const card = e.target.closest(".card");
    if (!card) return;

    const uid = card.dataset.uid;
    const nameInput = card.querySelector('input[data-k="name"]');
    const svcName = norm(nameInput?.value);

    const delSvcBtn = e.target.closest("button[data-act='delSvc'],button[data-act='delSvcQuick']");
    if (delSvcBtn) {
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };

      const idx = loadedData.services.findIndex((s) => String(s._uid) === String(uid));
      if (idx >= 0) {
        stagedPdfOps.delete(uid);
        loadedData.services.splice(idx, 1);
      }
      renderAll();
      return;
    }

    const attachBtn = e.target.closest("button[data-act='attachPdf'],button[data-act='attachPdfQuick']");
    if (attachBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      if (!svcName) return setMsg("먼저 서비스 name을 입력하세요.", "err");
      const input = card.querySelector('input[type="file"][data-k="pdfInput"]');
      if (!input) return;
      input.click();
      return;
    }

    const delPdfBtn = e.target.closest("button[data-act='delPdf'],button[data-act='delPdfQuick']");
    if (delPdfBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      if (!svcName) return setMsg("먼저 서비스 name을 입력하세요.", "err");
      if (!filesIndexLoaded) return;

      const cur = stagedPdfOps.get(uid);

      if (cur?.type === "delete") {
        stagedPdfOps.delete(uid);
        refreshCardPdfUI(card);
        updatePendingSummary();
        setMsg(`PDF 삭제 취소됨: ${pdfNameForService(svcName)}`, "ok");
        return;
      }

      if (cur?.type === "upsert") {
        const fileName = pdfNameForService(svcName);
        if (filesIndex.has(fileName)) {
          stagedPdfOps.set(uid, { type: "delete" });
          refreshCardPdfUI(card);
          updatePendingSummary();
          setMsg(`PDF 삭제 예정으로 변경됨: ${fileName} (저장 필요)`, "ok");
        } else {
          stagedPdfOps.delete(uid);
          refreshCardPdfUI(card);
          updatePendingSummary();
          setMsg(`PDF 첨부 대기 취소됨: ${fileName}`, "ok");
        }
        return;
      }

      const fileName = pdfNameForService(svcName);
      if (!filesIndex.has(fileName)) return setMsg(`삭제할 PDF가 없습니다: ${fileName}`, "err");

      stagedPdfOps.set(uid, { type: "delete" });
      refreshCardPdfUI(card);
      updatePendingSummary();
      setMsg(`PDF 삭제 예정: ${fileName} (저장 필요)`, "ok");
    }
  });

  // ✅ 서비스 PDF change
  $("svcList").addEventListener("change", async (e) => {
    const input = e.target.closest('input[type="file"][data-k="pdfInput"]');
    if (!input) return;

    const token = norm($("ghToken").value);
    const card = input.closest(".card");
    const uid = card?.dataset?.uid;
    const svcName = norm(card?.querySelector('input[data-k="name"]')?.value);

    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!token) return setMsg("토큰을 입력하세요.", "err");
    if (!svcName) return setMsg("먼저 서비스 name을 입력하세요.", "err");

    try {
      setMsg(`PDF 읽는 중(저장 대기): ${file.name} → ${svcName}.pdf`, "");
      const b64 = await fileToB64(file);

      stagedPdfOps.set(uid, { type: "upsert", b64, size: file.size, origName: file.name });
      refreshCardPdfUI(card);
      updatePendingSummary();

      const fileName = pdfNameForService(svcName);
      setMsg(`PDF ${filesIndex.has(fileName) ? "교체" : "첨부"} 저장 대기: ${fileName}`, "ok");
    } catch (e2) {
      console.error(e2);
      setMsg(String(e2.message || e2), "err");
    }
  });

  // ✅ 서비스 input
  $("svcList").addEventListener("input", (e) => {
    updatePendingSummary();

    if (e.target.matches('input[data-k="name"]')) {
      const card = e.target.closest(".card");
      if (card) {
        const cards = Array.from(requireEl("svcList").querySelectorAll(".card"));
        const idx = cards.indexOf(card);
        const sumTitle = card.querySelector(".sum-title");
        if (sumTitle) sumTitle.textContent = serviceSummaryText(idx, e.target.value);
        refreshCardPdfUI(card);
      }
    }
  });

  // ✅ 공지 click
  $("noticeList").addEventListener("click", (e) => {
    if (e.target.closest("button[data-act]")) {
      e.preventDefault();
      e.stopPropagation();
    }

    const btn = e.target.closest("button[data-act='delNotice'],button[data-act='delNoticeQuick']");
    if (!btn) return;

    const snap = snapshotFromFormWithUids();
    loadedData.services = ensureServiceUids(snap.services);
    loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };

    const card = btn.closest(".card");
    const uid = card?.dataset?.uid;
    if (!uid) return;

    const i = loadedData.notice.items.findIndex((x) => String(x._uid) === String(uid));
    if (i < 0) return;

    loadedData.notice.items.splice(i, 1);
    renderAll();
  });

  // ✅ 공지 input
  $("noticeList").addEventListener("input", (e) => {
    updatePendingSummary();
    if (e.target.matches('input[data-k="title"]')) {
      const card = e.target.closest(".card");
      if (card) {
        const cards = Array.from(requireEl("noticeList").querySelectorAll(".card"));
        const idx = cards.indexOf(card);
        const sumTitle = card.querySelector(".sum-title");
        if (sumTitle) sumTitle.textContent = noticeSummaryText(idx, e.target.value);
      }
    }
  });
  $("noticeId").addEventListener("input", () => updatePendingSummary());

  // ✅ 저장
  $("btnSave").addEventListener("click", async () => {
    setSaveMsg("");

    const token = norm($("ghToken").value);
    if (!token) return setSaveMsg("토큰을 입력하세요.", "err");

    try {
      const snap = snapshotFromFormWithUids();
      if (!norm(snap.notice.noticeId)) return setSaveMsg("noticeId(기준일)를 입력하세요.", "err");

      const { additions, deletions } = buildFileChangesForCommit(snap);
      const headline = norm($("commitMsg")?.value) || "Update via admin";
      setSaveMsg("저장 중… (한 번의 커밋으로 반영)", "");

      const commit = await createSingleCommit(token, headline, additions, deletions);

      await loadContentJson(token);
      await loadFilesDirIndex(token);
      renderAll();

      setSaveMsg(`저장 완료(1커밋): ${commit.oid}`, "ok");
    } catch (e) {
      console.error(e);
      setSaveMsg(String(e.message || e), "err");
    }
  });
});
