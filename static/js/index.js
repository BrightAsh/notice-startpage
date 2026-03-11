    /**
     * =========================
     * 1) 앞으로는 content.json만 수정
     * =========================
     */
    let SERVICES = [];
    let NOTICE = { noticeId: "", items: [] };
    let NEWS = [];
    let NEWS_SERVICE_CATALOG = [];

    function noteText(note){
      if (Array.isArray(note)) return note.join("\n");
      return note || "";
    }

    async function loadContent(){
      const res = await fetch("./content.json", { cache: "no-store" });
      if(!res.ok) throw new Error(`content.json 로드 실패 (${res.status})`);
      const data = await res.json();
      SERVICES = data.services || [];
      NOTICE = data.notice || { noticeId: "", items: [] };
      NEWS = Array.isArray(data.news) ? data.news : [];
      NEWS_SERVICE_CATALOG = Array.isArray(data.newsServiceCatalog) ? data.newsServiceCatalog : [];
    }

    // 공지 숨김 로컬스토리지 키
    const KEY_HIDE_UNTIL = (id) => `notice:hideUntil:${id}`;

    /**
     * =========================
     * 2) 렌더링/동작 로직
     * =========================
     */
    const $ = (sel) => document.querySelector(sel);

    const svcGrid = $("#svcGrid");
    const svcCount = $("#svcCount");

    const noticeList = $("#noticeList");
    const hideToday = $("#hideToday");
    const resetLocal = $("#resetLocal");
    const newsList = $("#newsList");
    const newsPrev = $("#newsPrev");
    const newsNext = $("#newsNext");
    const newsPages = $("#newsPages");
    const guideDrawer = $("#guideDrawer");
    const guideDrawerToggle = $("#guideDrawerToggle");
    const guideDrawerClose = $("#guideDrawerClose");
    const guideDrawerBackdrop = $("#guideDrawerBackdrop");
    const newsModal = $("#newsModal");
    const newsModalTitle = $("#newsModalTitle");
    const newsModalBackdrop = $("#newsModalBackdrop");
    const newsModalClose = $("#newsModalClose");
    const newsModalFrame = $("#newsModalFrame");
    const newsModalPrev = $("#newsModalPrev");
    const newsModalNext = $("#newsModalNext");

    const NEWS_PAGE_SIZE = 5;
    const NEWS_PAGE_GROUP_SIZE = 5;
    let newsPage = 1;
    let newsPageGroupStart = 1;
    let modalNewsIndex = -1;
    const SERVICE_COLOR_MAP = {
      "openai": "openai", "chatgpt": "openai",
      "gemini": "gemini", "google": "gemini", "notebooklm": "notebooklm",
      "claude": "claude", "anthropic": "claude",
      "perplexity": "perplexity",
      "xai": "xai", "grok": "xai",
      "elevenlabs": "elevenlabs",
      "flowith": "flowith",
      "genspark": "genspark",
      "copilot": "copilot", "github copilot": "copilot",
      "notion ai": "notion", "notion": "notion",
      "poe": "poe",
      "character.ai": "characterai", "character ai": "characterai",
      "cursor": "cursor",
      "suno": "suno",
      "runway": "runway",
      "heygen": "heygen",
      "lilysai": "lilysai", "lilys ai": "lilysai",
      "skywork": "skywork",
      "manus": "manus",
      "canva ai": "canva", "canva": "canva",
      "deepseek": "deepseek",
      "midjourney": "midjourney",
      "replit ai": "replit", "replit": "replit",
      "gamma": "gamma"
    };


    function fmtNow(){
      const d = new Date();
      const pad = (n) => String(n).padStart(2,"0");
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function endOfTodayTs(){
      const now = new Date();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      return end.getTime();
    }

    function isHiddenToday(){
      const raw = localStorage.getItem(KEY_HIDE_UNTIL(NOTICE.noticeId));
      if(!raw) return false;
      const until = Number(raw);
      return Number.isFinite(until) && Date.now() < until;
    }

    function setHiddenToday(on){
      if(on) localStorage.setItem(KEY_HIDE_UNTIL(NOTICE.noticeId), String(endOfTodayTs()));
      else localStorage.removeItem(KEY_HIDE_UNTIL(NOTICE.noticeId));
    }

    function faviconUrl(domain){
      // ChatGPT 파비콘이 S2에서 가끔 깨져서 예외 처리(안정적인 소스)
      if (domain === "chatgpt.com") return "https://chatgpt.com/favicon.ico";
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
    }

    function pdfHrefFor(name){
      const file = `${name}.pdf`;
      return `./files/${encodeURIComponent(file)}`;
    }

    async function urlExists(url){
      try{
        // 1) HEAD 우선 (가볍게 존재 여부만 확인)
        const head = await fetch(url, { method: "HEAD", cache: "no-store" });
        if(head.ok) return true;

        // 2) 일부 환경에서 HEAD가 막힐 수 있어 GET(Range)로 fallback
        if(head.status === 405 || head.status === 403){
          const get = await fetch(url, {
            method: "GET",
            headers: { "Range": "bytes=0-0" },
            cache: "no-store",
          });
          return get.ok;
        }
        return false;
      }catch(e){
        return false;
      }
    }

    async function renderGuide(){
      const grid = $("#drawerGuideGrid");
      if(!grid) return;

      grid.innerHTML = "";

      const checks = await Promise.all((SERVICES || []).map(async (s) => {
        const name = (s && s.name) ? String(s.name) : "";
        const href = name ? pdfHrefFor(name) : "";
        const ok = (name && href) ? await urlExists(href) : false;
        return { s, href, ok };
      }));

      for(const it of checks){
        const s = it.s || {};
        const enabled = !!it.ok;

        const box = document.createElement(enabled ? "a" : "div");
        box.className = "gitem" + (enabled ? "" : " gitem--disabled");

        if(enabled){
          box.href = it.href;
          box.target = "_blank";
          box.rel = "noopener";
        }else{
          box.setAttribute("aria-disabled", "true");
          // 서비스명은 '준비중'으로 대체하되, 마우스 올리면 원래 이름이 보이도록 title 제공
          box.title = `${(s.name || "").trim()} (PDF 준비중)`.trim();
        }

        const ic = document.createElement("div");
        ic.className = "gic";

        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        if(s.domain) img.src = faviconUrl(s.domain);

        img.onerror = () => {
          img.remove();
          ic.classList.add("fallback");
          ic.textContent = (s.name || "?").trim().slice(0,1).toUpperCase();
        };
        ic.appendChild(img);

        const label = document.createElement("div");
        label.className = "glabel";
        label.textContent = enabled ? (s.name || "-") : "준비중";

        box.appendChild(ic);
        box.appendChild(label);

        grid.appendChild(box);
      }
    }

    function renderServices(){
      svcGrid.innerHTML = "";

      for(const s of SERVICES){
        // ✅ disabled면 a가 아니라 div로 생성(링크 자체 제거)
        const card = document.createElement(s.disabled ? "div" : "a");
        card.className = "svc" + (s.disabled ? " svc--disabled" : "");

        if(!s.disabled){
          card.href = s.url || "#";
          card.target = "_blank";
          card.rel = "noopener";
        } else {
          card.setAttribute("aria-disabled", "true");
          card.tabIndex = -1; // (선택) 탭 포커스 제외
        }

        const ic = document.createElement("div");
        ic.className = "svc-ic";

        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        if(s.domain) img.src = faviconUrl(s.domain);
        img.onerror = () => {
          img.remove();
          ic.classList.add("fallback");
          ic.textContent = (s.name || "?").trim().slice(0,1).toUpperCase();
        };
        ic.appendChild(img);

        const txt = document.createElement("div");
        txt.className = "svc-txt";

        const nm = document.createElement("div");
        nm.className = "svc-name";
        nm.textContent = s.name || "(이름 없음)";

        const sub = document.createElement("div");
        sub.className = "svc-sub";
        sub.textContent = noteText(s.note); // ✅ 변경(문자열/배열 지원)

        txt.appendChild(nm);
        txt.appendChild(sub);

        card.appendChild(ic);
        card.appendChild(txt);

        // (기존) url 없을 때 처리(단, disabled는 제외)
        if(!s.disabled && !s.url){
          card.style.opacity = ".55";
          card.style.cursor = "not-allowed";
          card.addEventListener("click", (e) => e.preventDefault());
          sub.textContent = "URL 설정 필요";
        }

        svcGrid.appendChild(card);
      }

      svcCount.textContent = `${SERVICES.length}개`;
    }

    function renderNotice(){
      // ✅ 기준일 배지 자동 갱신
      const badge = $("#noticeBadge");
      if(badge) badge.textContent = `기준일: ${NOTICE.noticeId || "-"}`;

      const hidden = isHiddenToday();
      hideToday.checked = hidden;

      noticeList.innerHTML = "";
      for(const it of (NOTICE.items || [])){
        const li = document.createElement("li");
        li.className = "notice-item";

        // (요청) 전부 '안내'로 통일
        const tag = document.createElement("span");
        tag.className = "tag ok";
        tag.textContent = "안내";

        const box = document.createElement("div");
        const t = document.createElement("div");
        t.className = "ni-title";
        t.textContent = it.title || "-";

        const s = document.createElement("div");
        s.className = "ni-sub";
        s.textContent = it.sub || "";

        box.appendChild(t);
        box.appendChild(s);

        li.appendChild(tag);
        li.appendChild(box);
        noticeList.appendChild(li);
      }

      const body = $("#noticeBody");
      body.style.opacity = "1";
    }


    function normalizeServiceName(v){
      return String(v || "").trim();
    }

    function normalizeHexColor(v, fallback = "#94a3b8"){
      const raw = String(v || "").trim().replace(/^#/, "");
      if(/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
      if(/^[0-9a-fA-F]{3}$/.test(raw)) return `#${raw.split("").map((c) => c + c).join("").toLowerCase()}`;
      return fallback;
    }

    function hexToRgba(hex, alpha){
      const h = normalizeHexColor(hex).slice(1);
      const r = parseInt(h.slice(0,2), 16);
      const g = parseInt(h.slice(2,4), 16);
      const b = parseInt(h.slice(4,6), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }

    function badgeTextColor(hex){
      const h = normalizeHexColor(hex).slice(1);
      const r = parseInt(h.slice(0,2), 16);
      const g = parseInt(h.slice(2,4), 16);
      const b = parseInt(h.slice(4,6), 16);
      const yiq = (r * 299 + g * 587 + b * 114) / 1000;
      return yiq >= 150 ? "#0b1220" : "#f8fafc";
    }

    function serviceColor(service){
      const key = normalizeServiceName(service).toLowerCase();
      const item = (NEWS_SERVICE_CATALOG || []).find((it) => normalizeServiceName(it?.name).toLowerCase() === key);
      return item?.color ? normalizeHexColor(item.color) : "";
    }

    function splitLegacyTitle(title){
      const raw = String(title || "").trim();
      const m = raw.match(/^([^\-–—:|]+?)\s*[\-–—:|]\s+(.+)$/);
      if(!m) return { service: "", title: raw };
      return { service: String(m[1] || "").trim(), title: String(m[2] || "").trim() };
    }

    function normalizedNewsItems(){
      return (NEWS || []).map((it) => {
        const explicitService = normalizeServiceName(it?.service);
        const legacy = splitLegacyTitle(it?.title);
        const service = explicitService || legacy.service;
        return {
          service,
          serviceColor: serviceColor(service),
          title: legacy.title || String(it?.title || "").trim(),
          sub: String(it?.sub || "").trim(),
          date: String(it?.date || "").trim(),
          file: String(it?.file || "").trim(),
        };
      }).filter((it) => it.title && it.date).sort((a, b) => b.date.localeCompare(a.date));
    }

    function renderNews(){
      const items = normalizedNewsItems();
      const totalPages = Math.max(1, Math.ceil(items.length / NEWS_PAGE_SIZE));
      newsPage = Math.min(Math.max(1, newsPage), totalPages);

      const start = (newsPage - 1) * NEWS_PAGE_SIZE;
      const pageItems = items.slice(start, start + NEWS_PAGE_SIZE);

      newsList.innerHTML = "";
      for(const it of pageItems){
        const li = document.createElement("li");
        li.className = "news-item";

        const content = document.createElement(it.file ? "button" : "div");
        content.className = it.file ? "news-open" : "";
        if(it.file){
          content.type = "button";
          content.dataset.newsFile = it.file;
        }

        const row = document.createElement("div");
        row.className = "news-row";

        const svc = document.createElement("span");

        svc.className = "news-service";
        const toneKey = SERVICE_COLOR_MAP[(it.service || "").toLowerCase()] || "other";
        svc.classList.add(toneKey);
        svc.textContent = it.service || "기타";
        if(it.serviceColor){
          svc.style.setProperty("--news-badge-bg", hexToRgba(it.serviceColor, .24));
          svc.style.setProperty("--news-badge-border", hexToRgba(it.serviceColor, .45));
          svc.style.setProperty("--news-badge-fg", badgeTextColor(it.serviceColor));
        }

        const titleWrap = document.createElement("div");
        titleWrap.className = "news-service-title";

        const t = document.createElement("p");
        t.className = "news-title";
        t.textContent = it.title;

        const d = document.createElement("div");
        d.className = "news-date";
        d.textContent = it.date;

        titleWrap.appendChild(t);

        row.appendChild(svc);
        row.appendChild(titleWrap);
        row.appendChild(d);
        content.appendChild(row);
        li.appendChild(content);
        newsList.appendChild(li);
      }

      const maxGroupStart = Math.max(1, Math.floor((totalPages - 1) / NEWS_PAGE_GROUP_SIZE) * NEWS_PAGE_GROUP_SIZE + 1);
      if (newsPage < newsPageGroupStart || newsPage > (newsPageGroupStart + NEWS_PAGE_GROUP_SIZE - 1)) {
        newsPageGroupStart = Math.floor((newsPage - 1) / NEWS_PAGE_GROUP_SIZE) * NEWS_PAGE_GROUP_SIZE + 1;
      }
      newsPageGroupStart = Math.min(Math.max(1, newsPageGroupStart), maxGroupStart);

      newsPages.innerHTML = "";
      const groupEnd = Math.min(newsPageGroupStart + NEWS_PAGE_GROUP_SIZE - 1, totalPages);
      for(let p = newsPageGroupStart; p <= groupEnd; p += 1){
        const b = document.createElement("button");
        b.type = "button";
        b.className = "news-page-btn" + (p === newsPage ? " active" : "");
        b.textContent = String(p);
        b.dataset.page = String(p);
        newsPages.appendChild(b);
      }

      newsPrev.disabled = newsPageGroupStart <= 1;
      newsNext.disabled = newsPageGroupStart >= maxGroupStart;
    }


    function setModalNavState(idx, items){
      const hasPrev = idx > 0;
      const hasNext = idx >= 0 && idx < (items.length - 1);
      newsModalPrev.classList.toggle("hidden", !hasPrev);
      newsModalNext.classList.toggle("hidden", !hasNext);
    }

    function fitNewsModalHeight(){
      if(!newsModal.classList.contains("show")) return;
      const doc = newsModalFrame.contentDocument;
      if(!doc) return;
      const b = doc.body;
      const h = Math.max(b ? b.scrollHeight : 0, doc.documentElement ? doc.documentElement.scrollHeight : 0);
      const frameH = Math.min(Math.max(220, h + 8), Math.round(window.innerHeight * 0.72));
      newsModalFrame.style.height = `${frameH}px`;
    }

    function setNewsModal(open, opts = {}){
      const isOpen = !!open;
      newsModal.classList.toggle("show", isOpen);
      newsModalBackdrop.classList.toggle("show", isOpen);
      newsModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
      newsModalBackdrop.setAttribute("aria-hidden", isOpen ? "false" : "true");

      if(isOpen){
        modalNewsIndex = Number.isInteger(opts.index) ? opts.index : modalNewsIndex;
        const current = normalizedNewsItems()[modalNewsIndex];
        if(newsModalTitle) newsModalTitle.textContent = current?.title ? `AI Update · ${current.title}` : "AI Update News";
        newsModalFrame.style.height = "220px";
        newsModalFrame.src = opts.src || "about:blank";
        setModalNavState(modalNewsIndex, normalizedNewsItems());
      }else{
        modalNewsIndex = -1;
        if(newsModalTitle) newsModalTitle.textContent = "AI Update News";
        newsModalFrame.src = "about:blank";
        newsModalFrame.style.height = "220px";
        setModalNavState(-1, []);
      }
    }

    function renderHeader(){
      $("#nowPill").textContent = fmtNow();
      $("#renderAt").textContent = fmtNow();
    }

    hideToday.addEventListener("change", () => {
      setHiddenToday(hideToday.checked);
      renderNotice();
    });

    resetLocal.addEventListener("click", (e) => {
      e.preventDefault();
      localStorage.removeItem(KEY_HIDE_UNTIL(NOTICE.noticeId));
      hideToday.checked = false;
      renderNotice();
      alert("이 PC의 공지 상태를 초기화했습니다.");
    });

    newsPrev.addEventListener("click", () => {
      newsPageGroupStart = Math.max(1, newsPageGroupStart - NEWS_PAGE_GROUP_SIZE);
      newsPage = newsPageGroupStart;
      renderNews();
    });

    newsNext.addEventListener("click", () => {
      newsPageGroupStart += NEWS_PAGE_GROUP_SIZE;
      newsPage = newsPageGroupStart;

      renderNews();
    });

    newsPages.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-page]");
      if (!btn) return;
      newsPage = Number(btn.dataset.page || "1");
      renderNews();
    });

    newsList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-news-file]");
      if(!btn) return;
      const file = String(btn.dataset.newsFile || "").trim();
      if(!file) return;
      const items = normalizedNewsItems();
      const idx = items.findIndex((it) => it.file === file);
      setNewsModal(true, {
        index: idx,
        src: `./News/${encodeURIComponent(file)}`,
      });
    });

    newsModalPrev.addEventListener("click", () => {
      const items = normalizedNewsItems();
      if(modalNewsIndex <= 0) return;
      const nextIdx = modalNewsIndex - 1;
      const it = items[nextIdx];
      if(!it || !it.file) return;
      setNewsModal(true, { index: nextIdx, src: `./News/${encodeURIComponent(it.file)}` });
    });

    newsModalNext.addEventListener("click", () => {
      const items = normalizedNewsItems();
      if(modalNewsIndex < 0 || modalNewsIndex >= items.length - 1) return;
      const nextIdx = modalNewsIndex + 1;
      const it = items[nextIdx];
      if(!it || !it.file) return;
      setNewsModal(true, { index: nextIdx, src: `./News/${encodeURIComponent(it.file)}` });
    });

    newsModalClose.addEventListener("click", () => setNewsModal(false));
    newsModalBackdrop.addEventListener("click", () => setNewsModal(false));
    newsModalFrame.addEventListener("load", fitNewsModalHeight);
    window.addEventListener("resize", fitNewsModalHeight);

    function setGuideDrawer(open){
      guideDrawer.classList.toggle("open", !!open);
      guideDrawer.setAttribute("aria-hidden", open ? "false" : "true");
      guideDrawerToggle.setAttribute("aria-expanded", open ? "true" : "false");
      guideDrawerToggle.classList.toggle("hidden", !!open);

      guideDrawerBackdrop.classList.toggle("show", !!open);
    }

    guideDrawerToggle.addEventListener("click", () => setGuideDrawer(true));
    guideDrawerClose.addEventListener("click", () => setGuideDrawer(false));
    guideDrawerBackdrop.addEventListener("click", () => setGuideDrawer(false));

    document.addEventListener("click", (e) => {
      if (!guideDrawer.classList.contains("open")) return;
      const insideDrawer = guideDrawer.contains(e.target);
      const onToggle = guideDrawerToggle.contains(e.target);
      if (!insideDrawer && !onToggle) setGuideDrawer(false);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      setGuideDrawer(false);
      setNewsModal(false);
    });

    // Init (content.json 로드 후 렌더)
    (async function init(){
      renderHeader();

      try{
        await loadContent();
      }catch(err){
        console.error(err);
        const badge = $("#noticeBadge");
        if(badge) badge.textContent = "기준일: - (content.json 오류)";
        SERVICES = [];
        NOTICE = { noticeId: "", items: [] };
        NEWS = [];
      }

      renderServices();
      renderNotice();
      await renderGuide();
      renderNews();
      setModalNavState(-1, []);

      setInterval(() => {
        $("#nowPill").textContent = fmtNow();
      }, 60 * 1000);
    })();
