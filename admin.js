// ===== 고정 설정 =====
const OWNER = "BrightAsh";
const REPO = "notice-startpage";
const BRANCH = "main";
const FILE_PATH = "content.json";
const FILES_DIR = "files";
const NEWS_DIR = "News";

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
function slugifyForFile(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}
function normalizeNewsFileName(fileName, dateText, titleText, autoCreate = true) {
  const raw = norm(fileName).replace(/^\/+/, "").replaceAll("\\", "/");
  let base = raw.split("/").pop() || "";
  if (!base && autoCreate) {
    const d = norm(dateText) || new Date().toISOString().slice(0, 10);
    const t = slugifyForFile(titleText) || "news";
    base = `${d}-${t}.html`;
  }
  if (!base) return "";
  if (!/\.(html?|pdf)$/i.test(base)) base += ".html";
  return base;
}

function collectReservedNewsFileNames(excludeUid = "") {
  const reserved = new Set();
  const skipUid = String(excludeUid || "");

  for (const name of newsFilesIndex) reserved.add(String(name));

  (loadedData?.news || []).forEach((it) => {
    if (String(it?._uid || "") === skipUid) return;
    const fn = normalizeNewsFileName(it?.file, it?.date, it?.title, false);
    if (fn) reserved.add(fn);
  });

  for (const [uid, op] of stagedNewsFileOps.entries()) {
    if (String(uid) === skipUid) continue;
    if (op?.type === "upsert" && norm(op?.fileName)) {
      reserved.add(String(op.fileName));
    }
  }

  return reserved;
}

function suggestUniqueNewsFileName(dateText, titleText, excludeUid = "") {
  const base = normalizeNewsFileName("", dateText, titleText, true);
  if (!base) return "";

  const reserved = collectReservedNewsFileNames(excludeUid);
  if (!reserved.has(base)) return base;

  const m = base.match(/^(.*?)(\.html?)$/i);
  const stem = m ? m[1] : base;
  const ext = m ? m[2] : ".html";
  for (let i = 2; i < 1000; i += 1) {
    const cand = `${stem}-${i}${ext}`;
    if (!reserved.has(cand)) return cand;
  }
  return `${stem}-${Date.now()}${ext}`;
}

function markdownToHtml(text) {
  const src = String(text || "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  const out = [];
  let inList = false;
  let inCode = false;
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (!inCode) { out.push("<pre><code>"); inCode = true; }
      else { out.push("</code></pre>"); inCode = false; }
      continue;
    }
    if (inCode) { out.push(escapeHtml(line) + "\n"); continue; }

    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      if (inList) { out.push("</ul>"); inList = false; }
      const lv = h[1].length;
      out.push(`<h${lv}>${escapeHtml(h[2])}</h${lv}>`);
      continue;
    }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${escapeHtml(li[1])}</li>`);
      continue;
    }

    if (inList) { out.push("</ul>"); inList = false; }
    if (!line.trim()) { out.push(""); continue; }
    out.push(`<p>${escapeHtml(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function buildNewsHtmlDocument({ title, sub, date, bodyHtml }) {
  const safeTitle = escapeHtml(title || "AI Update News");
  const safeSub = escapeHtml(sub || "");
  const safeDate = escapeHtml(date || "");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    :root{--bg:#f5f7fb;--panel:#ffffff;--text:#0f172a;--muted:#64748b;--line:#dbe3ef;--accent:#0ea5e9;}
    *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Noto Sans KR,sans-serif;background:var(--bg);color:var(--text)}
    .wrap{max-width:900px;margin:0 auto;padding:32px 20px 40px}
    .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:22px 20px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
    h1{margin:0 0 6px;font-size:28px;line-height:1.2}
    .meta{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:13px;margin-bottom:16px}
    .badge{padding:4px 9px;border-radius:999px;border:1px solid #bfe8f8;background:#eef9ff;color:#0369a1;font-weight:700}
    .sub{font-size:15px;color:#334155;line-height:1.55;margin-bottom:18px}
    .content p,.content li{font-size:15px;line-height:1.7;color:#1e293b}
    .content h1,.content h2,.content h3{margin-top:1.2em;margin-bottom:.45em}
    .content pre{padding:12px;background:#0f172a;color:#e2e8f0;border-radius:10px;overflow:auto}
    .content ul{padding-left:20px}
    a.back{display:inline-block;margin-top:18px;color:var(--accent);text-decoration:none;font-weight:700}
  </style>
</head>
<body>
  <div class="wrap">
    <article class="card">
      <h1>${safeTitle}</h1>
      <div class="meta"><span class="badge">AI Update</span><span>${safeDate}</span></div>
      <div class="sub">${safeSub}</div>
      <section class="content">
${bodyHtml || "<p>내용이 없습니다.</p>"}
      </section>
      <a class="back" href="../index.html">← 홈으로 돌아가기</a>
    </article>
  </div>
</body>
</html>`;
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
function ensureNewsItemUids(items) {
  (items || []).forEach((it) => { if (!it._uid) it._uid = makeUid(); });
  return items;
}


const DEFAULT_NEWS_SERVICE_CATALOG = [
  { name: "ChatGPT", color: "#10b981" },
  { name: "Gemini", color: "#60a5fa" },
  { name: "Claude", color: "#f59e0b" },
  { name: "Perplexity", color: "#38bdf8" },
  { name: "Copilot", color: "#3b82f6" },
  { name: "Notion AI", color: "#6b7280" },
  { name: "Cursor", color: "#06b6d4" },
  { name: "Canva AI", color: "#22d3ee" },
  { name: "ElevenLabs", color: "#ec4899" },
  { name: "기타", color: "#94a3b8" },
];

function normalizeHexColor(v, fallback = "#94a3b8") {
  const raw = norm(v).replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return `#${raw.split("").map((c) => c + c).join("").toLowerCase()}`;
  return fallback;
}

function ensureNewsServiceCatalog(catalog, newsItems = []) {
  const out = [];
  const seen = new Set();
  const pushOne = (name, color = "#94a3b8") => {
    const n = norm(name);
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, color: normalizeHexColor(color) });
  };

  (catalog || []).forEach((it) => pushOne(it?.name, it?.color));
  DEFAULT_NEWS_SERVICE_CATALOG.forEach((it) => pushOne(it.name, it.color));
  (newsItems || []).forEach((it) => pushOne(it?.service, "#94a3b8"));
  return out;
}

function compareServiceNameForSort(a, b) {
  const na = norm(a);
  const nb = norm(b);
  const aEtc = na.toLowerCase() === "기타";
  const bEtc = nb.toLowerCase() === "기타";
  if (aEtc && !bEtc) return 1;
  if (!aEtc && bEtc) return -1;
  return na.localeCompare(nb, "ko", { sensitivity: "base" });
}

function getSortedNewsServices(catalog, newsItems = []) {
  return ensureNewsServiceCatalog(catalog, newsItems).sort((x, y) => compareServiceNameForSort(x?.name, y?.name));
}

function formatDateInput(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 8);
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  if (digits.length <= 4) return y;
  if (digits.length <= 6) return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function buildNewsServiceOptions(selected = "") {
  const cur = norm(selected);
  const list = getSortedNewsServices(loadedData?.newsServiceCatalog, loadedData?.news || []);
  const items = [...list];
  if (cur && !items.some((it) => norm(it.name).toLowerCase() === cur.toLowerCase())) {
    items.unshift({ name: cur, color: "#94a3b8" });
  }
  const opts = ['<option value="">(선택 안함)</option>'];
  items.forEach((it) => {
    const n = it.name;
    const sel = cur && n.toLowerCase() === cur.toLowerCase() ? " selected" : "";
    opts.push(`<option value="${escapeHtml(n)}"${sel}>${escapeHtml(n)}</option>`);
  });
  return opts.join("");
}

function buildNewsServiceSuggestions(query = "") {
  const q = norm(query).toLowerCase();
  const list = getSortedNewsServices(loadedData?.newsServiceCatalog, loadedData?.news || []);
  return list
    .filter((it) => !q || norm(it.name).toLowerCase().includes(q))
    .map((it) => it.name);
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

async function getRepoFileB64(token, path) {
  const res = await fetch(REST_GET_CONTENT(path), { headers: ghRestHeaders(token) });
  if (res.status === 404) return "";
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`파일 조회 실패(${path}): ${res.status} ${res.statusText}\n${t}`);
  }
  const json = await res.json();
  return String(json?.content || "").replace(/\n/g, "");
}

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
let newsFilesIndex = new Set();
let newsFilesIndexLoaded = false;

// 서비스별 PDF 스테이징
const stagedPdfOps = new Map();
const stagedNewsFileOps = new Map();

// Prompt PDF 스테이징(교체만)
let stagedPromptPdfOp = null;

// 원본 스냅샷(변경현황 계산용)
let originalSvcByUid = new Map();
let originalNoticeByUid = new Map();
let originalNoticeId = "";
let originalNewsByUid = new Map();
let originalNewsServiceCatalogJson = "[]";

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
function newsSummaryText(idx, item) {
  const t = norm(item?.title);
  const s = norm(item?.service);
  const d = norm(item?.date) || "날짜 미입력";
  const head = s ? `${d} · ${s}` : d;
  return t ? `뉴스 #${idx + 1} · ${head} · ${t}` : `뉴스 #${idx + 1} · ${head}`;
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

function newsCardTemplate(it, idx) {
  const card = document.createElement("details");
  card.className = "card";
  card.dataset.idx = String(idx);
  card.dataset.uid = String(it._uid || "");
  card.open = false;

  card.innerHTML = `
    <summary class="card-summary">
      <span class="sum-title">${escapeHtml(newsSummaryText(idx, it))}</span>
      <span class="sum-right">
        <span class="sum-actions">
          <button type="button" class="btn sum-btn" data-act="attachNewsBody">파일 첨부</button>
          <button type="button" class="btn sum-btn" data-act="delNewsBody">파일 삭제</button>

          <button type="button" class="btn sum-btn" data-act="delNewsQuick">뉴스 삭제</button>
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </span>
    </summary>

    <div class="card-body">
      <div class="card-hd" style="margin-bottom:10px;">
        <div class="card-title">편집</div>
        <button class="btn" data-act="delNews">뉴스 삭제</button>
      </div>

      <div class="grid2">
        <div>
          <label>date (YYYY-MM-DD)</label>
          <input type="text" data-k="date" value="${escapeHtml(it.date || "")}" placeholder="예: 2026-02-01" />
        </div>
        <div>
          <label>file (자동 생성/읽기 전용)</label>
          <input type="text" data-k="fileAuto" value="${escapeHtml(normalizeNewsFileName(it.file, it.date, it.title, true))}" readonly />
        </div>
      </div>
      <div class="grid2">
        <div>
          <label>title</label>
          <input type="text" data-k="title" value="${escapeHtml(it.title || "")}" />
        </div>
        <div>
          <label>service</label>
          <div class="svc-picker">
            <input type="text" class="svc-input" data-k="service" data-role="newsServiceInput" value="${escapeHtml(it.service || "")}" placeholder="Search AI Service" autocomplete="off" />
            <div class="svc-dropdown" data-k="serviceSuggest"></div>
          </div>
          <div class="small" style="margin-top:6px;">입력한 문자열을 포함하는 서비스만 목록에 표시됩니다. 목록에 없으면 직접 입력할 수 있습니다.</div>
        </div>
      </div>

      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <div style="flex:1;min-width:260px;font-size:12px;color:var(--muted);">
          뉴스 HTML 파일: <span data-k="newsBodyState">확인중…</span>
        </div>
        <input type="file" accept=".html,text/html" data-k="newsBodyInput" style="display:none" />
        <button class="btn" data-act="attachNewsBody">파일 첨부</button>
        <button class="btn danger" data-act="delNewsBody">파일 삭제</button>
      </div>
      <div class="small" style="margin-top:8px;">파일명은 <span class="mono">date-title.html</span> 규칙으로 자동 생성됩니다. title/date가 바뀌면 파일명도 자동으로 함께 변경됩니다.</div>
    </div>
  `;
  return card;
}

function toDateSortValue(v) {
  const s = norm(v);
  if (!s) return -Infinity;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : -Infinity;
}

function sortNewsLatestFirst(items) {
  return [...(items || [])].sort((a, b) => {
    const byDate = toDateSortValue(b?.date) - toDateSortValue(a?.date);
    if (byDate) return byDate;
    return norm(b?.title).localeCompare(norm(a?.title), "ko");
  });
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

  loadedData.newsServiceCatalog = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);
  loadedData.news = sortNewsLatestFirst(loadedData.news || []);
  const newsList = requireEl("newsList");
  newsList.innerHTML = "";
  (loadedData.news || []).forEach((it, i) => newsList.appendChild(newsCardTemplate(it, i)));

  refreshAllCardsPdfUI();
  refreshAllNewsBodyUI();
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

  const news = [];
  const newsCards = requireEl("newsList").querySelectorAll(".card");
  newsCards.forEach((card) => {
    const get = (k) => card.querySelector(`[data-k="${k}"]`);
    const uid = card.dataset.uid || makeUid();
    news.push({
      _uid: uid,
      service: get("service")?.value?.trim() || "",
      title: get("title")?.value?.trim() || "",
      date: get("date")?.value?.trim() || "",
      file: normalizeNewsFileName("", get("date")?.value?.trim() || "", get("title")?.value?.trim() || "", true),
    });
  });

  return { services, notice: { noticeId, items }, news, newsServiceCatalog: ensureNewsServiceCatalog(loadedData?.newsServiceCatalog, news) };
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
    news: (dataWithUids.news || []).map((it) => ({
      service: it.service || "",
      title: it.title || "",
      date: it.date || "",
      file: normalizeNewsFileName("", it.date, it.title, true),
    })),
    newsServiceCatalog: ensureNewsServiceCatalog(dataWithUids.newsServiceCatalog, dataWithUids.news || []),
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
  const news = ensureNewsItemUids(Array.isArray(parsed.news) ? parsed.news : []);
  const newsServiceCatalog = ensureNewsServiceCatalog(Array.isArray(parsed.newsServiceCatalog) ? parsed.newsServiceCatalog : [], news);

  loadedData = { services, notice, news, newsServiceCatalog };

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

  originalNewsByUid = new Map();
  (news || []).forEach((it) => {
    originalNewsByUid.set(String(it._uid), {
      service: it.service || "",
      title: it.title || "",
      date: it.date || "",
      file: normalizeNewsFileName("", it.date, it.title, true),
    });
  });

  originalNewsServiceCatalogJson = JSON.stringify(ensureNewsServiceCatalog(newsServiceCatalog, news));

  stagedPdfOps.clear();
  stagedNewsFileOps.clear();
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

async function loadNewsDirIndex(token) {
  newsFilesIndex = new Set();
  newsFilesIndexLoaded = false;

  const res = await fetch(REST_GET_CONTENT(NEWS_DIR), { headers: ghRestHeaders(token) });
  if (res.status === 404) {
    newsFilesIndexLoaded = true;
    return true;
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`불러오기 실패(News/): ${res.status} ${res.statusText}
${t}`);
  }

  const arr = await res.json();
  if (Array.isArray(arr)) {
    arr.forEach((it) => {
      if (it?.type === "file" && typeof it?.name === "string" && /\.html?$/i.test(it.name)) {
        newsFilesIndex.add(it.name);
      }
    });
  }
  newsFilesIndexLoaded = true;
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
  stagedNewsFileOps.clear();
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

  originalNewsByUid = new Map();
  (loadedData.news || []).forEach((it) => {
    originalNewsByUid.set(String(it._uid), {
      title: it.title || "",
      date: it.date || "",
      file: normalizeNewsFileName("", it.date, it.title, true),
    });
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

function refreshAllNewsBodyUI() {
  const cards = document.querySelectorAll("#newsList .card");
  cards.forEach((card) => refreshNewsBodyUI(card));
}

function getNewsBodyUiState(uid, dateText, titleText, fileText) {
  const fileName = norm(fileText) || normalizeNewsFileName("", dateText, titleText, true);
  const repoHas = !!fileName && newsFilesIndex.has(fileName);
  const staged = stagedNewsFileOps.get(uid) || null;
  return { fileName, repoHas, staged };
}

function refreshNewsBodyUI(card) {
  const uid = card.dataset.uid;
  const tokenOk = !!norm($("ghToken")?.value);
  const date = card.querySelector('input[data-k="date"]')?.value || "";
  const title = card.querySelector('input[data-k="title"]')?.value || "";
  const fileInputText = card.querySelector('input[data-k="fileAuto"]');
  const fileText = fileInputText?.value || "";

  const stateEl = card.querySelector('[data-k="newsBodyState"]');
  const bodyAttach = card.querySelector('.card-body button[data-act="attachNewsBody"]');
  const bodyDel = card.querySelector('.card-body button[data-act="delNewsBody"]');
  const quickAttach = card.querySelector('summary button[data-act="attachNewsBody"]');
  const quickDel = card.querySelector('summary button[data-act="delNewsBody"]');
  const quickNewsDel = card.querySelector('summary button[data-act="delNewsQuick"]');

  if (!stateEl || !bodyAttach || !bodyDel || !quickAttach || !quickDel || !quickNewsDel) return;

  quickNewsDel.disabled = !tokenOk;

  const { fileName, repoHas, staged } = getNewsBodyUiState(uid, date, title, fileText);
  if (fileInputText && fileInputText.value !== fileName) fileInputText.value = fileName;

  if (!fileName) {
    stateEl.textContent = "date/title을 입력하면 파일명이 자동 생성됩니다.";

    bodyAttach.textContent = "파일 첨부";
    bodyAttach.disabled = true;
    bodyDel.style.display = "none";

    quickAttach.textContent = "파일 첨부";
    quickAttach.disabled = true;
    quickDel.style.display = "none";
    return;
  }

  if (!newsFilesIndexLoaded) {
    stateEl.textContent = "확인중…";
    bodyAttach.disabled = true;
    bodyDel.style.display = "none";
    quickAttach.disabled = true;
    quickDel.style.display = "none";
    return;
  }

  const attachLabel = staged?.type === "upsert"
    ? "파일 다시 선택(저장 대기)"
    : (repoHas ? "파일 교체(덮어쓰기)" : "파일 첨부");

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
    bodyDel.textContent = "파일 삭제";
    bodyDel.disabled = !tokenOk;

    quickDel.style.display = repoHas ? "" : "none";
    quickDel.textContent = "파일 삭제";
    quickDel.disabled = !tokenOk;
    return;
  }

  if (repoHas) {
    stateEl.textContent = `연결됨: ${fileName}`;

    bodyDel.style.display = "";
    bodyDel.textContent = "파일 삭제";
    bodyDel.disabled = !tokenOk;

    quickDel.style.display = "";
    quickDel.textContent = "파일 삭제";
    quickDel.disabled = !tokenOk;
  } else {
    stateEl.textContent = `없음: ${fileName}`;
    bodyDel.style.display = "none";
    quickDel.style.display = "none";
  }

  if (fileInputText) fileInputText.value = fileName;
}

// ===== 커밋 파일 변경 =====
async function buildFileChangesForCommit(token, dataWithUids) {
  const cleanData = stripInternalFields(dataWithUids);
  const contentJsonB64 = utf8ToB64(JSON.stringify(cleanData, null, 2));

  const additions = [{ path: FILE_PATH, contents: contentJsonB64 }];
  const deletionPaths = new Set();
  const additionPaths = new Set([FILE_PATH]);

  const curSvcByUid = new Map((dataWithUids.services || []).map((s) => [String(s._uid), s]));
  const curNameSet = new Set();
  (dataWithUids.services || []).forEach((s) => { if (norm(s.name)) curNameSet.add(norm(s.name)); });

  const curNewsByUid = new Map((dataWithUids.news || []).map((it) => [String(it._uid), it]));
  const curNewsFileSet = new Set();
  (dataWithUids.news || []).forEach((it) => {
    const fn = normalizeNewsFileName(it.file, it.date, it.title, false);
    if (fn) curNewsFileSet.add(fn);
  });

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

  for (const [uid, op] of stagedNewsFileOps.entries()) {
    const it = curNewsByUid.get(String(uid));
    if (!it) continue;
    const fileName = normalizeNewsFileName(it?.file, it?.date, it?.title, false);
    if (!fileName) continue;
    const path = `${NEWS_DIR}/${fileName}`;

    if (op?.type === "upsert") {
      additions.push({ path, contents: op.b64 });
      additionPaths.add(path);
      continue;
    }
    if (op?.type === "delete") {
      if (newsFilesIndex.has(fileName)) deletionPaths.add(path);
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

  for (const [uid, orig] of originalNewsByUid.entries()) {
    const cur = curNewsByUid.get(String(uid));
    if (!cur) continue;

    const oldFile = normalizeNewsFileName(orig?.file, orig?.date, orig?.title, false);
    const newFile = normalizeNewsFileName(cur?.file, cur?.date, cur?.title, false);
    if (!oldFile || !newFile || oldFile === newFile) continue;

    const oldPath = `${NEWS_DIR}/${oldFile}`;
    const newPath = `${NEWS_DIR}/${newFile}`;
    const hasStagedFileChange = stagedNewsFileOps.has(String(uid));

    if (!hasStagedFileChange && newsFilesIndex.has(oldFile)) {
      const oldB64 = await getRepoFileB64(token, oldPath);
      if (oldB64) {
        additions.push({ path: newPath, contents: oldB64 });
        additionPaths.add(newPath);
      }
    }

    if (newsFilesIndex.has(oldFile)) deletionPaths.add(oldPath);
  }

  for (const [uid, orig] of originalNewsByUid.entries()) {
    if (curNewsByUid.has(String(uid))) continue;

    const oldFile = normalizeNewsFileName(orig?.file, orig?.date, orig?.title, false);
    if (!oldFile) continue;
    if (curNewsFileSet.has(oldFile)) continue;
    if (!newsFilesIndex.has(oldFile)) continue;

    deletionPaths.add(`${NEWS_DIR}/${oldFile}`);
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
function isNewsChanged(orig, cur) {
  const a = (v) => norm(v);
  return (
    a(orig.service) !== a(cur.service) ||
    a(orig.title) !== a(cur.title) ||
    a(orig.date) !== a(cur.date) ||
    a(orig.file) !== a(cur.file)
  );
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
    setNum("p_news_total", 0); setNum("p_news_add", 0); setNum("p_news_mod", 0); setNum("p_news_del", 0);
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

  const curNewsByUid = new Map((snap.news || []).map((it) => [String(it._uid), it]));
  let newsAdd = 0, newsMod = 0, newsDel = 0;
  for (const [uid, cur] of curNewsByUid.entries()) {
    const orig = originalNewsByUid.get(String(uid));
    if (!orig) newsAdd += 1;
    else if (isNewsChanged(orig, cur)) newsMod += 1;
  }
  for (const uid of originalNewsByUid.keys()) {
    if (!curNewsByUid.has(String(uid))) newsDel += 1;
  }
  for (const [uid, op] of stagedNewsFileOps.entries()) {
    if (op?.type !== "upsert" && op?.type !== "delete") continue;
    const cur = curNewsByUid.get(String(uid));
    const orig = originalNewsByUid.get(String(uid));
    if (!orig || !cur) continue;
    if (!isNewsChanged(orig, cur)) newsMod += 1;
  }
  
  const currentCatalogJson = JSON.stringify(ensureNewsServiceCatalog(loadedData?.newsServiceCatalog, snap.news || []));
  if (currentCatalogJson !== originalNewsServiceCatalogJson) newsMod += 1;

  const newsTotal = newsAdd + newsMod + newsDel;

  setNum("p_news_total", newsTotal);
  setNum("p_news_add", newsAdd);
  setNum("p_news_mod", newsMod);
  setNum("p_news_del", newsDel);

  if (legacy) {
    legacy.textContent =
      `PDF ${pdfTotal}(첨부${pdfAttach}/교체${pdfReplace}/삭제${pdfDelete}) · ` +
      `서비스 ${svcTotal}(추가${svcAdd}/수정${svcMod}/삭제${svcDel}) · ` +
      `공지 ${ntTotal}(추가${ntAdd}/수정${ntMod}/삭제${ntDel}) · ` +
      `뉴스 ${newsTotal}(추가${newsAdd}/수정${newsMod}/삭제${newsDel})`;
  }

  setResetButtonState((pdfTotal + svcTotal + ntTotal + newsTotal) === 0);
}


function syncNewsServiceCatalogFromForm() {
  if (!loadedData) return;
  const snap = snapshotFromFormWithUids();
  loadedData.services = ensureServiceUids(snap.services || []);
  loadedData.notice = { ...(snap.notice || { noticeId: "", items: [] }), items: ensureNoticeItemUids((snap.notice?.items) || []) };
  loadedData.news = ensureNewsItemUids(snap.news || []);
  loadedData.newsServiceCatalog = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);
}

function renderServiceSuggestionDropdown(container, query = "") {
  if (!container) return;
  const list = buildNewsServiceSuggestions(query);
  container.innerHTML = list.map((name) => `<button type="button" class="svc-opt" data-v="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
  container.classList.toggle("show", list.length > 0);
}

function hideAllServiceSuggestionDropdowns() {
  document.querySelectorAll('.svc-dropdown.show').forEach((el) => el.classList.remove('show'));
}

function refreshSvcPickerState(input) {
  const picker = input?.closest('.svc-picker');
  if (!picker) return;
  picker.classList.toggle('has-value', !!norm(input.value));
}

function refreshAllNewsServiceInputs() {
  document.querySelectorAll('#newsList .card input[data-k="service"]').forEach((input) => {
    const dropdown = input.closest('.svc-picker')?.querySelector('[data-k="serviceSuggest"]');
    refreshSvcPickerState(input);
    renderServiceSuggestionDropdown(dropdown, input.value);
  });
}

function serviceBadgeTextColor(hex) {
  const c = normalizeHexColor(hex, "#94a3b8").slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0b1220" : "#f8fafc";
}

function updateNewsSvcAddPreview() {
  const name = norm($("newsSvcAddName")?.value || "") || "미리보기";
  const color = normalizeHexColor($("newsSvcAddColor")?.value || "#94a3b8", "#94a3b8");
  const preview = $("newsSvcAddPreview");
  const picker = $("newsSvcAddColorPicker");
  if (picker && picker.value !== color) picker.value = color;
  if (!preview) return;
  preview.textContent = name;
  preview.style.background = color;
  preview.style.borderColor = color;
  preview.style.color = serviceBadgeTextColor(color);
}

function isDuplicateCatalogColor(list, idx, color) {
  const target = normalizeHexColor(color, "");
  if (!target) return false;
  return list.some((it, i) => i !== idx && normalizeHexColor(it?.color, "") === target);
}

function updateNewsSvcRowPreview(row, name, color, duplicate) {
  if (!row) return;
  const badge = row.querySelector('.news-svc-badge');
  const textColor = serviceBadgeTextColor(color);

  if (badge) {
    badge.style.background = color;
    badge.style.borderColor = color;
    badge.style.color = textColor;
    badge.textContent = name || "미지정";
  }
  row.classList.toggle('dup', !!duplicate);
}

function renderNewsServiceCatalogModal() {
  const box = document.getElementById('newsSvcList');
  if (!box || !loadedData) return;
  const list = getSortedNewsServices(loadedData.newsServiceCatalog, loadedData.news || []);
  loadedData.newsServiceCatalog = list;

  box.innerHTML = "";
  list.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'news-svc-row';
    const color = normalizeHexColor(it.color);
    const duplicate = isDuplicateCatalogColor(list, idx, color);

    row.innerHTML = `
      <input type="text" data-k="name" data-idx="${idx}" value="${escapeHtml(it.name || "")}" placeholder="서비스명" />
      <input type="text" data-k="colorText" data-idx="${idx}" value="${escapeHtml(color)}" placeholder="#RRGGBB" />
      <input type="color" data-k="colorPicker" data-idx="${idx}" value="${escapeHtml(color)}" title="색상 선택" />
      <div class="row" style="justify-content:flex-end;gap:6px;">
        <span class="news-svc-badge">${escapeHtml(it.name || "미지정")}</span>
        <button type="button" class="btn danger" data-act="delNewsSvc" data-idx="${idx}">삭제</button>
      </div>
    `;
    box.appendChild(row);
    updateNewsSvcRowPreview(row, norm(it.name), color, duplicate);
  });
}

function setNewsSvcModal(open) {
  const modal = document.getElementById('newsSvcModal');
  const backdrop = document.getElementById('newsSvcModalBackdrop');
  if (!modal || !backdrop) return;
  const on = !!open;
  modal.classList.toggle('show', on);
  backdrop.classList.toggle('show', on);
  modal.setAttribute('aria-hidden', on ? 'false' : 'true');
  backdrop.setAttribute('aria-hidden', on ? 'false' : 'true');
  if (on) renderNewsServiceCatalogModal();
}

function refreshNewsAddServiceSuggest() {
  const input = document.getElementById("newsAddService");
  const suggest = document.getElementById("newsAddServiceSuggest");
  if (!input || !suggest) return;
  refreshSvcPickerState(input);
  renderServiceSuggestionDropdown(suggest, input.value);
}

function setNewsAddModal(open) {
  const modal = document.getElementById('newsAddModal');
  const backdrop = document.getElementById('newsAddModalBackdrop');
  if (!modal || !backdrop) return;
  const on = !!open;
  modal.classList.toggle('show', on);
  backdrop.classList.toggle('show', on);
  modal.setAttribute('aria-hidden', on ? 'false' : 'true');
  backdrop.setAttribute('aria-hidden', on ? 'false' : 'true');

  if (on) {
    const dateInput = document.getElementById("newsAddDate");
    const titleInput = document.getElementById("newsAddTitle");
    const svcInput = document.getElementById("newsAddService");
    if (dateInput) dateInput.value = "";
    if (titleInput) titleInput.value = "";
    if (svcInput) svcInput.value = "";
    refreshSvcPickerState(svcInput);
    refreshNewsAddServiceSuggest();
    dateInput?.focus();
  }
}

function setBasicModal(open, modalId, backdropId) {
  const modal = document.getElementById(modalId);
  const backdrop = document.getElementById(backdropId);
  if (!modal || !backdrop) return;
  const on = !!open;
  modal.classList.toggle('show', on);
  backdrop.classList.toggle('show', on);
  modal.setAttribute('aria-hidden', on ? 'false' : 'true');
  backdrop.setAttribute('aria-hidden', on ? 'false' : 'true');
}

const setSvcAddModal = (open) => setBasicModal(open, 'svcAddModal', 'svcAddModalBackdrop');
const setNoticeAddModal = (open) => setBasicModal(open, 'noticeAddModal', 'noticeAddModalBackdrop');
const setNewsSvcAddModal = (open) => setBasicModal(open, 'newsSvcAddModal', 'newsSvcAddModalBackdrop');

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
  requireEl("btnAddNews");
  requireEl("btnNewsExpandAll");
  requireEl("btnNewsCollapseAll");
  requireEl("btnManageNewsServices");
  requireEl("btnAddNewsSvc");
  requireEl("btnApplyNewsSvc");
  requireEl("btnCloseNewsSvcModal");
  requireEl("newsSvcList");
  requireEl("newsSvcModal");
  requireEl("newsSvcModalBackdrop");
  requireEl("newsAddModal");
  requireEl("newsAddModalBackdrop");
  requireEl("newsAddDate");
  requireEl("newsAddTitle");
  requireEl("newsAddService");
  requireEl("newsAddServiceSuggest");
  requireEl("svcAddModal");
  requireEl("svcAddModalBackdrop");
  requireEl("btnCloseSvcAddModal");
  requireEl("btnCancelSvcAdd");
  requireEl("btnApplySvcAdd");
  requireEl("noticeAddModal");
  requireEl("noticeAddModalBackdrop");
  requireEl("btnCloseNoticeAddModal");
  requireEl("btnCancelNoticeAdd");
  requireEl("btnApplyNoticeAdd");
  requireEl("newsSvcAddModal");
  requireEl("newsSvcAddModalBackdrop");
  requireEl("btnCloseNewsSvcAddModal");
  requireEl("btnCancelNewsSvcAdd");
  requireEl("btnApplyNewsSvcAdd");
  requireEl("newsSvcAddColorPicker");
  requireEl("newsSvcAddPreview");
  requireEl("btnApplyNewsAdd");
  requireEl("btnCancelNewsAdd");
  requireEl("btnCloseNewsAddModal");
  requireEl("btnSave");

  wirePromptPdfControls();

  $("ghToken").addEventListener("input", () => {
    const v = norm($("ghToken").value);
    $("tokenState").textContent = v ? "입력됨" : "토큰 필요";
    refreshAllCardsPdfUI();
    refreshAllNewsBodyUI();
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
      await loadNewsDirIndex(token);
      renderAll();
      setMsg("불러오기 완료. 수정 후 '저장'하면 한 번에 커밋됩니다.", "ok");
    } catch (e) {
      console.error(e);
      setMsg(String(e.message || e), "err");
    }
  });

  $("btnAddSvc").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] }, news: [], newsServiceCatalog: ensureNewsServiceCatalog([]) };
    setSvcAddModal(true);
  });

  $("btnAddNotice").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] }, news: [], newsServiceCatalog: ensureNewsServiceCatalog([]) };
    setNoticeAddModal(true);
  });

  $("btnAddNews").addEventListener("click", () => {
    if (!loadedData) loadedData = { services: [], notice: { noticeId: "", items: [] }, news: [], newsServiceCatalog: ensureNewsServiceCatalog([]) };
    if (!requireEl("editor").classList.contains("hidden")) {
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
      loadedData.news = ensureNewsItemUids(snap.news || []);
    }
    setNewsAddModal(true);
  });

  $("btnCloseSvcAddModal").addEventListener("click", () => setSvcAddModal(false));
  $("btnCancelSvcAdd").addEventListener("click", () => setSvcAddModal(false));
  $("svcAddModalBackdrop").addEventListener("click", () => setSvcAddModal(false));
  $("btnApplySvcAdd").addEventListener("click", () => {
    if (!loadedData) return;
    const name = norm($("svcAddName")?.value || "");
    if (!name) return setMsg("서비스 name은 필수입니다.", "err");
    if (!requireEl("editor").classList.contains("hidden")) {
      syncNewsServiceCatalogFromForm();
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
      loadedData.news = ensureNewsItemUids(snap.news || []);
    }
    loadedData.services.push({ _uid: makeUid(), name, url: norm($("svcAddUrl")?.value || ""), domain: norm($("svcAddDomain")?.value || ""), note: $("svcAddNote")?.value || "", disabled: !!$("svcAddDisabled")?.checked });
    renderAll();
    setSvcAddModal(false);
  });

  $("btnCloseNoticeAddModal").addEventListener("click", () => setNoticeAddModal(false));
  $("btnCancelNoticeAdd").addEventListener("click", () => setNoticeAddModal(false));
  $("noticeAddModalBackdrop").addEventListener("click", () => setNoticeAddModal(false));
  $("btnApplyNoticeAdd").addEventListener("click", () => {
    if (!loadedData) return;
    if (!requireEl("editor").classList.contains("hidden")) {
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
      loadedData.news = ensureNewsItemUids(snap.news || []);
    }
    if (!loadedData.notice) loadedData.notice = { noticeId: "", items: [] };
    loadedData.notice.items.push({ _uid: makeUid(), title: norm($("noticeAddTitle")?.value || ""), sub: norm($("noticeAddSub")?.value || "") });
    renderAll();
    setNoticeAddModal(false);
  });

  $("btnCloseNewsSvcAddModal").addEventListener("click", () => setNewsSvcAddModal(false));
  $("newsSvcAddName").addEventListener("input", () => updateNewsSvcAddPreview());
  $("newsSvcAddColor").addEventListener("input", () => updateNewsSvcAddPreview());
  $("newsSvcAddColorPicker").addEventListener("input", (e) => { $("newsSvcAddColor").value = e.target.value; updateNewsSvcAddPreview(); });
  $("btnCancelNewsSvcAdd").addEventListener("click", () => setNewsSvcAddModal(false));
  $("newsSvcAddModalBackdrop").addEventListener("click", () => setNewsSvcAddModal(false));
  $("btnApplyNewsSvcAdd").addEventListener("click", () => {
    if (!loadedData) return;
    loadedData.newsServiceCatalog = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);
    const name = norm($("newsSvcAddName")?.value || "");
    if (!name) return setMsg("서비스명을 입력하세요.", "err");
    const color = normalizeHexColor($("newsSvcAddColorPicker")?.value || $("newsSvcAddColor")?.value || "#94a3b8", "#94a3b8");
    if (loadedData.newsServiceCatalog.some((it) => norm(it?.name).toLowerCase() === name.toLowerCase())) return setMsg("이미 있는 서비스명입니다.", "err");
    if (loadedData.newsServiceCatalog.some((it) => normalizeHexColor(it?.color, "") === color)) return setMsg("이미 사용 중인 색상입니다.", "err");
    loadedData.newsServiceCatalog.push({ name, color });
    renderNewsServiceCatalogModal();
    setNewsSvcAddModal(false);
    $("newsSvcAddName").value = "";
    $("newsSvcAddColor").value = "#94a3b8";
    $("newsSvcAddColorPicker").value = "#94a3b8";
    updateNewsSvcAddPreview();
  });

  $("btnCloseNewsAddModal").addEventListener("click", () => setNewsAddModal(false));
  $("btnCancelNewsAdd").addEventListener("click", () => setNewsAddModal(false));
  $("newsAddModalBackdrop").addEventListener("click", () => setNewsAddModal(false));
  $("newsAddService").addEventListener("input", () => refreshNewsAddServiceSuggest());
  $("newsAddDate").addEventListener("input", (e) => { e.target.value = formatDateInput(e.target.value); });
  $("newsAddServiceSuggest").addEventListener("click", (e) => {
    const btn = e.target.closest('.svc-opt');
    if (!btn) return;
    const input = document.getElementById("newsAddService");
    if (input) input.value = btn.dataset.v || "";
    refreshSvcPickerState(input);
    refreshNewsAddServiceSuggest();
    hideAllServiceSuggestionDropdowns();
  });
  $("btnApplyNewsAdd").addEventListener("click", () => {
    if (!loadedData) return;
    const date = formatDateInput($("newsAddDate")?.value || "");
    const title = norm($("newsAddTitle")?.value || "");
    const service = norm($("newsAddService")?.value || "");
    if (!date || !title) return setMsg("뉴스 추가 시 date/title은 필수입니다.", "err");

    loadedData.news.push({ _uid: makeUid(), service, title, date, file: "" });
    loadedData.news = sortNewsLatestFirst(loadedData.news || []);
    renderAll();
    setNewsAddModal(false);
    setMsg("뉴스 항목을 추가했습니다. (저장 전까지 캐시 상태)", "ok");
  });

  $("btnNewsExpandAll").addEventListener("click", () => {
    document.querySelectorAll("#newsList details.card").forEach((el) => { el.open = true; });
  });
  $("btnNewsCollapseAll").addEventListener("click", () => {
    document.querySelectorAll("#newsList details.card").forEach((el) => { el.open = false; });
  });

  $("btnManageNewsServices").addEventListener("click", () => {
    if (!loadedData) return;
    syncNewsServiceCatalogFromForm();
    setNewsSvcModal(true);
  });

  $("btnCloseNewsSvcModal").addEventListener("click", () => setNewsSvcModal(false));
  $("newsSvcModalBackdrop").addEventListener("click", () => setNewsSvcModal(false));

  $("btnAddNewsSvc").addEventListener("click", () => {
    if (!loadedData) return;
    $("newsSvcAddName").value = "";
    $("newsSvcAddColor").value = "#94a3b8";
    $("newsSvcAddColorPicker").value = "#94a3b8";
    updateNewsSvcAddPreview();
    setNewsSvcAddModal(true);
  });

  $("newsSvcList").addEventListener("input", (e) => {
    if (!loadedData) return;
    const row = e.target.closest('.news-svc-row');
    const idx = Number(e.target?.dataset?.idx || -1);
    if (!row || !Number.isInteger(idx) || idx < 0) return;

    const list = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);
    loadedData.newsServiceCatalog = list;
    const cur = list[idx];
    if (!cur) return;

    if (e.target.matches('input[data-k="name"]')) {
      cur.name = e.target.value;
      const colorText = row.querySelector('input[data-k="colorText"]')?.value || cur.color || "#94a3b8";
      const candidate = normalizeHexColor(colorText, cur.color || "#94a3b8");
      const duplicate = isDuplicateCatalogColor(list, idx, candidate);
      updateNewsSvcRowPreview(row, norm(cur.name), candidate, duplicate);
      return;
    }

    if (e.target.matches('input[data-k="colorText"]')) {
      const color = normalizeHexColor(e.target.value, cur.color || "#94a3b8");
      if (isDuplicateCatalogColor(list, idx, color)) {
        e.target.value = normalizeHexColor(cur.color || "#94a3b8");
        const picker = row.querySelector('input[data-k="colorPicker"]');
        if (picker) picker.value = normalizeHexColor(cur.color || "#94a3b8");
        setMsg("이미 사용 중인 색상은 선택할 수 없습니다.", "err");
        updateNewsSvcRowPreview(row, norm(cur.name), normalizeHexColor(cur.color || "#94a3b8"), true);
        return;
      }
      const picker = row.querySelector('input[data-k="colorPicker"]');
      if (picker) picker.value = color;
      const duplicate = isDuplicateCatalogColor(list, idx, color);
      updateNewsSvcRowPreview(row, norm(cur.name), color, duplicate);
      return;
    }

    if (e.target.matches('input[data-k="colorPicker"]')) {
      const color = normalizeHexColor(e.target.value, cur.color || "#94a3b8");
      if (isDuplicateCatalogColor(list, idx, color)) {
        e.target.value = normalizeHexColor(cur.color || "#94a3b8");
        setMsg("이미 사용 중인 색상은 선택할 수 없습니다.", "err");
        updateNewsSvcRowPreview(row, norm(cur.name), normalizeHexColor(cur.color || "#94a3b8"), true);
        return;
      }
      cur.color = color;
      const txt = row.querySelector('input[data-k="colorText"]');
      if (txt) txt.value = color;
      updateNewsSvcRowPreview(row, norm(cur.name), color, false);
    }
  });

  $("newsSvcList").addEventListener("click", (e) => {
    if (!loadedData) return;
    const list = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);
    loadedData.newsServiceCatalog = list;

    const delBtn = e.target.closest('button[data-act="delNewsSvc"]');
    if (!delBtn) return;
    const idx = Number(delBtn.dataset.idx || -1);
    if (!Number.isInteger(idx) || idx < 0) return;
    loadedData.newsServiceCatalog.splice(idx, 1);
    renderNewsServiceCatalogModal();
  });

  $("btnApplyNewsSvc").addEventListener("click", () => {
    if (!loadedData) return;
    loadedData.newsServiceCatalog = ensureNewsServiceCatalog(loadedData.newsServiceCatalog, loadedData.news || []);

    const used = new Set();
    for (const it of loadedData.newsServiceCatalog) {
      const c = normalizeHexColor(it?.color, "#94a3b8");
      if (used.has(c)) {
        setMsg("중복된 색상이 있어 적용할 수 없습니다. 각 서비스에 고유 색상을 지정하세요.", "err");
        renderNewsServiceCatalogModal();
        return;
      }
      used.add(c);
    }

    refreshAllNewsServiceInputs();
    updatePendingSummary();
    setNewsSvcModal(false);
    setMsg("뉴스 서비스/색상 목록을 적용했습니다.", "ok");
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
      loadedData.news = ensureNewsItemUids(snap.news || []);

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
      loadedData.news = ensureNewsItemUids(snap.news || []);

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
  $("newsList").addEventListener("click", (e) => {
    if (e.target.closest("button[data-act]")) {
      e.preventDefault();
      e.stopPropagation();
    }

    const card = e.target.closest(".card");
    const uid = card?.dataset?.uid;
    if (!card || !uid) return;

    const token = norm($("ghToken").value);

    const delBtn = e.target.closest("button[data-act='delNews'],button[data-act='delNewsQuick']");
    if (delBtn) {
      const snap = snapshotFromFormWithUids();
      loadedData.services = ensureServiceUids(snap.services);
      loadedData.notice = { ...snap.notice, items: ensureNoticeItemUids(snap.notice.items || []) };
      loadedData.news = ensureNewsItemUids(snap.news || []);

      const i = loadedData.news.findIndex((x) => String(x._uid) === String(uid));
      if (i < 0) return;

      stagedNewsFileOps.delete(uid);
      loadedData.news.splice(i, 1);
      renderAll();
      return;
    }

    const attachBodyBtn = e.target.closest("button[data-act='attachNewsBody']");
    if (attachBodyBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      const input = card.querySelector('input[type="file"][data-k="newsBodyInput"]');
      if (!input) return;
      input.click();
      return;
    }

    const delBodyBtn = e.target.closest("button[data-act='delNewsBody']");
    if (delBodyBtn) {
      if (!token) return setMsg("토큰을 입력하세요.", "err");
      const date = card.querySelector('input[data-k="date"]')?.value || "";
      const title = card.querySelector('input[data-k="title"]')?.value || "";
      const fileVal = card.querySelector('input[data-k="fileAuto"]')?.value || "";
      const fileName = normalizeNewsFileName(fileVal, date, title);

      const cur = stagedNewsFileOps.get(uid);
      if (cur?.type === "delete") {
        stagedNewsFileOps.delete(uid);
        refreshNewsBodyUI(card);
        updatePendingSummary();
        setMsg(`뉴스 파일 삭제 취소: ${fileName}`, "ok");
        return;
      }

      if (cur?.type === "upsert") {
        if (newsFilesIndex.has(fileName)) stagedNewsFileOps.set(uid, { type: "delete" });
        else stagedNewsFileOps.delete(uid);
        refreshNewsBodyUI(card);
        updatePendingSummary();
        setMsg(`뉴스 파일 상태 변경: ${fileName}`, "ok");
        return;
      }

      if (!newsFilesIndex.has(fileName)) return setMsg(`삭제할 뉴스 파일이 없습니다: ${fileName}`, "err");
      stagedNewsFileOps.set(uid, { type: "delete" });
      refreshNewsBodyUI(card);
      updatePendingSummary();
      setMsg(`뉴스 파일 삭제 예정: ${fileName} (저장 필요)`, "ok");
    }
  });

  $("newsList").addEventListener("input", (e) => {
    updatePendingSummary();
    const card = e.target.closest(".card");
    if (!card) return;

    if (e.target.matches('input[data-k="date"]')) {
      const formatted = formatDateInput(e.target.value);
      if (e.target.value !== formatted) e.target.value = formatted;
    }

    if (e.target.matches('input[data-k="service"]')) {
      const dropdown = card.querySelector('[data-k="serviceSuggest"]');
      refreshSvcPickerState(e.target);
      renderServiceSuggestionDropdown(dropdown, e.target.value);
    }
    if (e.target.matches('input[data-k="title"],input[data-k="date"],input[data-k="service"]')) {
      const cards = Array.from(requireEl("newsList").querySelectorAll(".card"));
      const idx = cards.indexOf(card);
      const sumTitle = card.querySelector(".sum-title");
      if (sumTitle) {
        const titleNow = card.querySelector('input[data-k="title"]')?.value || "";
        const dateNow = card.querySelector('input[data-k="date"]')?.value || "";
        const serviceNow = card.querySelector('[data-k="service"]')?.value || "";

        sumTitle.textContent = newsSummaryText(idx, { title: titleNow, date: dateNow, service: serviceNow });
      }
    }
    if (e.target.matches('input[data-k="title"],input[data-k="date"]')) {
      refreshNewsBodyUI(card);
    }
  });



  document.addEventListener("click", (e) => {
    if (!e.target.closest('.svc-picker')) hideAllServiceSuggestionDropdowns();
  });

  $("newsAddService").addEventListener("focus", () => refreshNewsAddServiceSuggest());
  $("newsAddService").addEventListener("click", () => refreshNewsAddServiceSuggest());

  $("newsList").addEventListener("focusin", (e) => {
    const input = e.target.closest('input[data-k="service"]');
    if (!input) return;
    const card = input.closest('.card');
    const dropdown = card?.querySelector('[data-k="serviceSuggest"]');
    refreshSvcPickerState(input);
    renderServiceSuggestionDropdown(dropdown, input.value);
  });

  $("newsList").addEventListener("click", (e) => {
    const opt = e.target.closest('.svc-opt');
    if (!opt) return;
    const card = opt.closest('.card');
    const input = card?.querySelector('input[data-k="service"]');
    const dropdown = card?.querySelector('[data-k="serviceSuggest"]');
    if (input) input.value = opt.dataset.v || "";
    refreshSvcPickerState(input);
    if (dropdown) dropdown.classList.remove('show');
    updatePendingSummary();
  });

  $("newsList").addEventListener("change", async (e) => {
    const input = e.target.closest('input[type="file"][data-k="newsBodyInput"]');
    if (!input) return;

    const token = norm($("ghToken").value);
    const card = input.closest(".card");
    const uid = card?.dataset?.uid;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !uid) return;
    if (!token) return setMsg("토큰을 입력하세요.", "err");

    try {
      const date = card.querySelector('input[data-k="date"]')?.value || "";
      const title = card.querySelector('input[data-k="title"]')?.value || "";
      const fileInputText = card.querySelector('input[data-k="fileAuto"]');
      const fileName = normalizeNewsFileName("", date, title, true);

      if (fileInputText) fileInputText.value = fileName;

      const htmlText = await file.text();
      const b64 = utf8ToB64(htmlText);

      stagedNewsFileOps.set(uid, { type: "upsert", b64, size: file.size, fileName, origName: file.name });
      refreshNewsBodyUI(card);
      updatePendingSummary();
      setMsg(`뉴스 파일 저장 대기: ${NEWS_DIR}/${fileName} (저장 필요)`, "ok");
    } catch (err) {
      console.error(err);
      setMsg(String(err.message || err), "err");
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
      for (const item of (snap.news || [])) {
        if (!norm(item.title) || !norm(item.date)) {
          return setSaveMsg("뉴스 항목은 title/date를 모두 입력하세요.", "err");
        }
      }

      const { additions, deletions } = await buildFileChangesForCommit(token, snap);
      const headline = norm($("commitMsg")?.value) || "Update via admin";
      setSaveMsg("저장 중… (한 번의 커밋으로 반영)", "");

      const commit = await createSingleCommit(token, headline, additions, deletions);

      await loadContentJson(token);
      await loadFilesDirIndex(token);
      await loadNewsDirIndex(token);
      renderAll();

      setSaveMsg(`저장 완료(1커밋): ${commit.oid}`, "ok");
    } catch (e) {
      console.error(e);
      setSaveMsg(String(e.message || e), "err");
    }
  });
});
