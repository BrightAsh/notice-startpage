// admin.js
let currentSha = null;
let data = null;

const $ = (id) => document.getElementById(id);

function setStatus(msg, type = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "small " + (type === "ok" ? "ok" : type === "danger" ? "danger" : "");
}

function utf8ToB64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64)));
}

function readRepoConfig() {
  const owner = $("owner").value.trim();
  const repo = $("repo").value.trim();
  const branch = $("branch").value.trim() || "main";
  const path = $("path").value.trim() || "content.json";
  const token = $("token").value.trim();
  if (!owner || !repo) throw new Error("owner/repo를 입력하세요.");
  return { owner, repo, branch, path, token };
}

function renderAll() {
  if (!data) return;

  // notice
  $("noticeId").value = data.notice?.noticeId ?? "";
  renderNoticeItems();

  // services
  renderServices();

  // raw json
  $("rawJson").value = JSON.stringify(data, null, 2);
}

function renderNoticeItems() {
  const wrap = $("noticeItems");
  wrap.innerHTML = "";

  const items = (data.notice?.items ?? []);
  items.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.margin = "10px 0";
    card.innerHTML = `
      <div class="row">
        <div style="flex:1; min-width:220px;">
          <label>title</label>
          <input data-n-title="${idx}" value="${escapeHtml(it.title ?? "")}" />
        </div>
        <div style="flex:2; min-width:260px;">
          <label>sub</label>
          <input data-n-sub="${idx}" value="${escapeHtml(it.sub ?? "")}" />
        </div>
        <button class="btn" data-n-del="${idx}">삭제</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  // bind
  wrap.querySelectorAll("[data-n-title]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-n-title"));
      data.notice.items[i].title = e.target.value;
      syncRaw();
    });
  });
  wrap.querySelectorAll("[data-n-sub]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-n-sub"));
      data.notice.items[i].sub = e.target.value;
      syncRaw();
    });
  });
  wrap.querySelectorAll("[data-n-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.getAttribute("data-n-del"));
      data.notice.items.splice(i, 1);
      renderAll();
    });
  });
}

function renderServices() {
  const body = $("servicesBody");
  body.innerHTML = "";

  const services = (data.services ?? []);
  services.forEach((s, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input data-s-name="${idx}" value="${escapeHtml(s.name ?? "")}" /></td>
      <td><input data-s-url="${idx}" value="${escapeHtml(s.url ?? "")}" /></td>
      <td><input data-s-domain="${idx}" value="${escapeHtml(s.domain ?? "")}" /></td>
      <td><textarea data-s-note="${idx}">${escapeHtml(s.note ?? "")}</textarea></td>
      <td style="text-align:center;">
        <input type="checkbox" data-s-dis="${idx}" ${s.disabled ? "checked" : ""} />
      </td>
      <td style="text-align:center;">
        <button class="btn" data-s-del="${idx}">삭제</button>
      </td>
    `;
    body.appendChild(tr);
  });

  // bind
  body.querySelectorAll("[data-s-name]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-s-name"));
      data.services[i].name = e.target.value;
      syncRaw();
    });
  });
  body.querySelectorAll("[data-s-url]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-s-url"));
      data.services[i].url = e.target.value;
      syncRaw();
    });
  });
  body.querySelectorAll("[data-s-domain]").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-s-domain"));
      data.services[i].domain = e.target.value;
      syncRaw();
    });
  });
  body.querySelectorAll("[data-s-note]").forEach((ta) => {
    ta.addEventListener("input", (e) => {
      const i = Number(e.target.getAttribute("data-s-note"));
      data.services[i].note = e.target.value;
      syncRaw();
    });
  });
  body.querySelectorAll("[data-s-dis]").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const i = Number(e.target.getAttribute("data-s-dis"));
      const checked = e.target.checked;
      if (checked) data.services[i].disabled = true;
      else delete data.services[i].disabled;
      syncRaw();
    });
  });
  body.querySelectorAll("[data-s-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const i = Number(e.target.getAttribute("data-s-del"));
      data.services.splice(i, 1);
      renderAll();
    });
  });
}

function syncRaw() {
  $("rawJson").value = JSON.stringify(data, null, 2);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadFromGitHub() {
  const { owner, repo, branch, path, token } = readRepoConfig();
  setStatus("불러오는 중...");

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, {
    headers: token ? { "Authorization": `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`불러오기 실패: ${res.status} ${t}`);
  }
  const j = await res.json();
  currentSha = j.sha;

  const text = b64ToUtf8(j.content.replace(/\n/g, ""));
  data = JSON.parse(text);

  // 구조 보정
  data.services = Array.isArray(data.services) ? data.services : [];
  data.notice = data.notice ?? { noticeId: "", items: [] };
  data.notice.items = Array.isArray(data.notice.items) ? data.notice.items : [];

  // 토큰은 sessionStorage에만
  if (token) sessionStorage.setItem("gh_token", token);

  renderAll();
  setStatus("불러오기 완료", "ok");
}

async function saveToGitHub() {
  const { owner, repo, branch, path, token } = readRepoConfig();
  if (!token) throw new Error("저장하려면 GitHub Token이 필요합니다.");

  // noticeId/폼 반영
  data.notice = data.notice ?? {};
  data.notice.noticeId = $("noticeId").value.trim();

  // Raw JSON이 수정돼 있으면 그걸 우선 적용
  try {
    const raw = $("rawJson").value;
    const parsed = JSON.parse(raw);
    data = parsed;
  } catch (e) {
    // raw json 파싱 실패면 폼 상태로 진행 (원하면 여기서 실패 처리해도 됨)
  }

  const contentStr = JSON.stringify(data, null, 2);
  const body = {
    message: `Update content.json via admin (${new Date().toISOString()})`,
    content: utf8ToB64(contentStr),
    sha: currentSha,
    branch
  };

  setStatus("저장(커밋) 중...");

  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`저장 실패: ${res.status} ${t}`);
  }

  const j = await res.json();
  currentSha = j.content?.sha ?? currentSha;

  setStatus("저장 완료! (Pages 반영은 약간 지연될 수 있음)", "ok");
}

function init() {
  // 토큰 자동 채움(세션 한정)
  const savedToken = sessionStorage.getItem("gh_token");
  if (savedToken) $("token").value = savedToken;

  $("btnLoad").addEventListener("click", async () => {
    try { await loadFromGitHub(); }
    catch (e) { setStatus(e.message, "danger"); }
  });

  $("btnSave").addEventListener("click", async () => {
    try { await saveToGitHub(); }
    catch (e) { setStatus(e.message, "danger"); }
  });

  $("btnAddNoticeItem").addEventListener("click", () => {
    data.notice = data.notice ?? { noticeId: "", items: [] };
    data.notice.items = data.notice.items ?? [];
    data.notice.items.push({ title: "", sub: "" });
    renderAll();
  });

  $("btnAddService").addEventListener("click", () => {
    data.services = data.services ?? [];
    data.services.push({ name: "", url: "", domain: "", note: "" });
    renderAll();
  });

  $("btnApplyRaw").addEventListener("click", () => {
    try {
      const parsed = JSON.parse($("rawJson").value);
      data = parsed;
      // 구조 보정
      data.services = Array.isArray(data.services) ? data.services : [];
      data.notice = data.notice ?? { noticeId: "", items: [] };
      data.notice.items = Array.isArray(data.notice.items) ? data.notice.items : [];
      renderAll();
      setStatus("Raw JSON 적용 완료", "ok");
    } catch (e) {
      setStatus("Raw JSON 파싱 실패: " + e.message, "danger");
    }
  });
}

init();
