// ===== 고정 설정(여기에 오너/레포/브랜치 박기) =====
const OWNER = "BrightAsh";
const REPO = "notice-startpage";
const BRANCH = "main";
const FILE_PATH = "content.json";
const FILES_DIR = "files"; // 서비스별 소개 PDF 저장 폴더

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

// ===== base64 binary (PDF) =====
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

function normName(name) {
  return String(name || "").trim();
}
function pdfFileNameForServiceName(serviceName) {
  const n = normName(serviceName);
  return n ? `${n}.pdf` : "";
}

// ===== GitHub API =====
function ghHeaders(token) {
  return {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Authorization": `Bearer ${token}`, // fine-grained 권장
  };
}

// slash 유지하면서 encode
function ghContentUrl(path) {
  const p = String(path)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${p}`;
}

const GH_GET_URL = () => `${ghContentUrl(FILE_PATH)}?ref=${encodeURIComponent(BRANCH)}`;
const GH_PUT_URL = () => ghContentUrl(FILE_PATH);
const GH_FILES_LIST_URL = () => `${ghContentUrl(FILES_DIR)}?ref=${encodeURIComponent(BRANCH)}`;

// ===== state =====
let loadedSha = null; // 불러오기 성공 시 sha 저장
let loadedData = null; // 현재 편집중 데이터

let filesIndex = new Map(); // key: "서비스명.pdf" -> { sha, path }
let filesIndexLoaded = false; // files/ 목록 로딩 여부
let pendingSvcPdfDelete = new Set(); // 서비스 삭제 시 PDF도 같이 삭제(저장 시 반영)

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

    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <div style="flex:1;min-width:220px;font-size:12px;color:var(--muted);">
        소개 PDF: <span data-k="pdfState">확인중…</span>
      </div>
      <input type="file" accept="application/pdf" data-k="pdfInput" style="display:none" />
      <button class="btn" data-act="attachPdf">PDF 첨부</button>
      <button class="btn" data-act="delPdf" style="border-color:rgba(251,113,133,.55);background:rgba(251,113,133,.14);">PDF 삭제</button>
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

  // pdf ui
  refreshAllCardsPdfUI();
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

// ===== actions: content.json =====
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

// ===== actions: PDF (files/{서비스명}.pdf) =====
async function loadFilesIndex(token) {
  filesIndex = new Map();
  filesIndexLoaded = false;

  const res = await fetch(GH_FILES_LIST_URL(), { headers: ghHeaders(token) });

  // files/ 폴더가 없을 수 있음(초기 상태) — 이 경우는 그냥 빈 상태로 둠
  if (res.status === 404) {
    filesIndexLoaded = true;
    return true;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`files/ 목록 불러오기 실패: ${res.status} ${res.statusText}\n${t}`);
  }

  const arr = await res.json();
  if (Array.isArray(arr)) {
    arr.forEach((it) => {
      if (it?.type === "file" && typeof it?.name === "string" && /\.pdf$/i.test(it.name)) {
        filesIndex.set(it.name, { sha: it.sha, path: it.path });
      }
    });
  }

  filesIndexLoaded = true;
  return true;
}

function refreshAllCardsPdfUI() {
  const cards = document.querySelectorAll("#svcList .card");
  cards.forEach((card) => refreshCardPdfUI(card));
}

function refreshCardPdfUI(card) {
  const name = normName(card?.querySelector('input[data-k="name"]')?.value);
  const stateEl = card?.querySelector('[data-k="pdfState"]');
  const btnAttach = card?.querySelector('button[data-act="attachPdf"]');
  const btnDel = card?.querySelector('button[data-act="delPdf"]');

  if (!stateEl || !btnAttach || !btnDel) return;

  const token = normName($("ghToken")?.value);
  const tokenOk = !!token;

  if (!name) {
    stateEl.textContent = "name을 입력하면 PDF를 첨부할 수 있어요.";
    btnAttach.textContent = "PDF 첨부";
    btnAttach.disabled = true;
    btnDel.style.display = "none";
    return;
  }

  if (!filesIndexLoaded) {
    stateEl.textContent = "확인중…";
    btnAttach.disabled = true;
    btnDel.style.display = "none";
    return;
  }

  const fileName = pdfFileNameForServiceName(name);
  const meta = filesIndex.get(fileName);

  btnAttach.textContent = meta ? "PDF 교체(덮어쓰기)" : "PDF 첨부";
  btnAttach.disabled = !tokenOk;

  if (meta) {
    stateEl.textContent = `연결됨: ${fileName}`;
    btnDel.style.display = "";
    btnDel.disabled = !tokenOk;
  } else {
    stateEl.textContent = `없음: ${fileName}`;
    btnDel.style.display = "none";
  }
}

async function uploadServicePdf(token, serviceName, file) {
  const name = normName(serviceName);
  if (!name) throw new Error("서비스 name이 비어있습니다.");
  if (!file) throw new Error("첨부할 파일이 없습니다.");

  const targetFileName = pdfFileNameForServiceName(name);
  const targetPath = `${FILES_DIR}/${targetFileName}`;
  const existing = filesIndex.get(targetFileName);

  const contentB64 = await fileToB64(file);
  const body = {
    message: `Upload PDF for ${name} via admin`,
    content: contentB64,
    branch: BRANCH,
    ...(existing?.sha ? { sha: existing.sha } : {}), // 덮어쓰기(업데이트)
  };

  const res = await fetch(ghContentUrl(targetPath), {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PDF 업로드 실패: ${res.status} ${res.statusText}\n${t}`);
  }

  const out = await res.json();
  const sha = out?.content?.sha;
  if (sha) filesIndex.set(targetFileName, { sha, path: targetPath });
  return true;
}

async function deleteServicePdf(token, serviceName) {
  const name = normName(serviceName);
  if (!name) throw new Error("서비스 name이 비어있습니다.");

  const fileName = pdfFileNameForServiceName(name);
  const meta = filesIndex.get(fileName);
  if (!meta?.sha) return false; // 없으면 스킵

  const body = {
    message: `Delete PDF for ${name} via admin`,
    sha: meta.sha,
    branch: BRANCH,
  };

  const res = await fetch(ghContentUrl(meta.path), {
    method: "DELETE",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // 이미 없으면 조용히 처리
  if (res.status === 404) {
    filesIndex.delete(fileName);
    return false;
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PDF 삭제 실패: ${res.status} ${res.statusText}\n${t}`);
  }

  filesIndex.delete(fileName);
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
    refreshAllCardsPdfUI();
  });

  $("btnLoad").addEventListener("click", async () => {
    setMsg("");
    setSaveMsg("");
    const token = $("ghToken").value.trim();
    if (!token) return setMsg("토큰을 입력하세요.", "err");

    try {
      await loadContentWithToken(token);
      await loadFilesIndex(token);
      pendingSvcPdfDelete = new Set();
      renderAll();
      setMsg("불러오기 완료. (PDF 상태도 확인됨) 수정 후 저장하세요.", "ok");
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

  // 서비스 리스트: 삭제/첨부/삭제(PDF)
  $("svcList").addEventListener("click", async (e) => {
    const token = $("ghToken").value.trim();
    const card = e.target.closest(".card");
    if (!card) return;

    // 1) 서비스 삭제 → 저장 시 PDF도 같이 삭제 예약
    const delSvcBtn = e.target.closest("button[data-act='delSvc']");
    if (delSvcBtn) {
      const idx = Number(card?.dataset?.idx);
      if (!Number.isFinite(idx)) return;

      const name = normName(card.querySelector('input[data-k="name"]')?.value);
      if (name) pendingSvcPdfDelete.add(name);

      loadedData.services.splice(idx, 1);
      renderAll();
      return;
    }

    // 2) PDF 첨부/교체(덮어쓰기)
    const attachBtn = e.target.closest("button[data-act='attachPdf']");
    if (attachBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      const name = normName(card.querySelector('input[data-k="name"]')?.value);
      if (!name) return setMsg("먼저 서비스 name을 입력하세요.", "err");

      const input = card.querySelector('input[type="file"][data-k="pdfInput"]');
      if (!input) return;
      input.click();
      return;
    }

    // 3) PDF 삭제
    const delPdfBtn = e.target.closest("button[data-act='delPdf']");
    if (delPdfBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      const name = normName(card.querySelector('input[data-k="name"]')?.value);
      if (!name) return setMsg("먼저 서비스 name을 입력하세요.", "err");

      delPdfBtn.disabled = true;
      setMsg(`PDF 삭제 중: ${name}.pdf ...`);
      try {
        await deleteServicePdf(token, name);
        await loadFilesIndex(token);
        refreshAllCardsPdfUI();
        setMsg(`PDF 삭제 완료: ${name}.pdf`, "ok");
      } catch (e2) {
        console.error(e2);
        setMsg(String(e2.message || e2), "err");
      } finally {
        delPdfBtn.disabled = false;
      }
    }
  });

  // PDF 파일 선택 → 업로드(덮어쓰기)
  $("svcList").addEventListener("change", async (e) => {
    const input = e.target.closest('input[type="file"][data-k="pdfInput"]');
    if (!input) return;

    const card = input.closest(".card");
    const token = $("ghToken").value.trim();
    const file = input.files?.[0];

    input.value = ""; // 같은 파일 재선택 가능
    if (!file) return;
    if (!token) return setMsg("토큰을 입력하세요.", "err");

    const name = normName(card.querySelector('input[data-k="name"]')?.value);
    if (!name) return setMsg("먼저 서비스 name을 입력하세요.", "err");

    setMsg(`PDF 업로드 중(덮어쓰기): ${name}.pdf ...`);
    try {
      await uploadServicePdf(token, name, file);
      await loadFilesIndex(token);
      refreshAllCardsPdfUI();
      setMsg(`PDF 업로드 완료: ${name}.pdf`, "ok");
    } catch (e2) {
      console.error(e2);
      setMsg(String(e2.message || e2), "err");
    }
  });

  // name 변경 시 PDF 버튼 상태 즉시 갱신
  $("svcList").addEventListener("input", (e) => {
    if (!e.target.matches('input[data-k="name"]')) return;
    const card = e.target.closest(".card");
    if (card) refreshCardPdfUI(card);
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

      // 1) content.json 저장
      await saveContentWithToken(token, newData);

      // 2) 서비스 삭제된 항목의 PDF를 저장 시 함께 삭제
      const stillExists = new Set((newData.services || []).map((s) => normName(s.name)).filter(Boolean));
      const targets = Array.from(pendingSvcPdfDelete).filter((n) => n && !stillExists.has(n));

      let delOk = 0;
      let delFail = 0;
      for (const name of targets) {
        try {
          const did = await deleteServicePdf(token, name);
          if (did) delOk += 1;
        } catch (e2) {
          delFail += 1;
          console.error(e2);
        }
      }
      pendingSvcPdfDelete.clear();

      // 3) 파일 목록 갱신
      await loadFilesIndex(token);
      refreshAllCardsPdfUI();

      const extra = targets.length ? ` (PDF 삭제: 성공 ${delOk}${delFail ? ", 실패 " + delFail : ""})` : "";
      setSaveMsg("저장(커밋) 완료. 메인 페이지 새로고침하면 반영됩니다." + extra, "ok");
    } catch (e) {
      console.error(e);
      setSaveMsg(String(e.message || e), "err");
    }
  });
});
