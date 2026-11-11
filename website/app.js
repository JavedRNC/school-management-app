(() => {
  "use strict";
  const API = "https://school-api-7y80.onrender.com";
  const RELEASE = "https://api.github.com/repos/JavedRNC/school-management-app/releases/tags/latest-apk";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // ------------------------------------------------------------ language
  const EN = {};
  $$("[data-i18n]").forEach((el) => { EN[el.dataset.i18n] = el.innerHTML; });
  $$("[data-i18n-attr]").forEach((el) => {
    const [attr, key] = el.dataset.i18nAttr.split(":");
    EN[key] = el.getAttribute(attr) || "";
  });
  Object.assign(EN, window.EN_EXTRA || {});
  let lang = store.get("lang") || ((navigator.language || "").toLowerCase().startsWith("hi") ? "hi" : "en");

  function t(key, vars) {
    let s = (lang === "hi" && window.HI[key]) || EN[key] || key;
    if (vars) Object.keys(vars).forEach((k) => { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }

  function applyLang(animate) {
    const swap = () => {
      document.documentElement.lang = lang;
      $$("[data-i18n]").forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
      $$("[data-i18n-attr]").forEach((el) => {
        const [attr, key] = el.dataset.i18nAttr.split(":");
        el.setAttribute(attr, t(key));
      });
      $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
      document.title = lang === "hi" ? "School Hub · भारतीय स्कूलों के लिए स्कूल मैनेजमेंट ऐप" : "School Hub · School management app for Indian schools";
      renderNow();
      renderSchools();
      renderBuild();
    };
    if (!animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return swap();
    document.body.classList.add("switching");
    setTimeout(() => { swap(); document.body.classList.remove("switching"); }, 180);
  }
  $$(".lang button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang;
    store.set("lang", lang);
    applyLang(true);
  }));

  // ------------------------------------------------------------ the school day (India time)
  const toMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
  function indiaNow() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false })
      .formatToParts(new Date());
    const get = (type) => (parts.find((p) => p.type === type) || {}).value;
    return { min: Number(get("hour")) % 24 * 60 + Number(get("minute")), sunday: get("weekday") === "Sun" };
  }
  const items = $$("#day-track li");
  const first = toMin(items[0].dataset.start), last = toMin(items[items.length - 1].dataset.end);
  function renderNow() {
    const { min, sunday } = indiaNow();
    let current = null;
    items.forEach((li) => {
      const s = toMin(li.dataset.start), e = toMin(li.dataset.end);
      const isNow = !sunday && min >= s && min < e;
      li.classList.toggle("past", !sunday && min >= e);
      li.classList.toggle("now", isNow);
      if (isNow) current = li;
    });
    let text;
    if (sunday) text = t("now.sunday");
    else if (min < first) text = t("now.before", { t: items[0].dataset.start });
    else if (min >= last) text = t("now.after");
    else text = t("now.during", { s: current ? current.querySelector("span").textContent : "" });
    $("#day-now-text").textContent = text;
    const pct = sunday ? 0 : Math.max(0, Math.min(100, ((min - first) / (last - first)) * 100));
    // the marker sits at the start of each step; spread progress over the track
    $("#day-track").style.setProperty("--progress", pct.toFixed(1) + "%");
  }
  requestAnimationFrame(() => setTimeout(renderNow, 250));   // the one load-time moment: the day fills to "now"
  setInterval(renderNow, 60 * 1000);

  // ------------------------------------------------------------ roles
  const tabs = $$('.role-tabs [role="tab"]');
  const img = $("#role-img");
  function selectRole(btn, focus) {
    tabs.forEach((b) => { const on = b === btn; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; });
    $("#role-panel").setAttribute("aria-labelledby", btn.id);
    $$("[data-role-list]").forEach((ul) => { ul.hidden = ul.dataset.roleList !== btn.dataset.role; });
    const src = "assets/" + btn.dataset.role + ".webp";
    if (!img.src.endsWith(src)) {
      img.classList.add("swap");
      setTimeout(() => { img.src = src; img.onload = () => img.classList.remove("swap"); }, 160);
    }
    if (focus) btn.focus();
  }
  tabs.forEach((b, i) => {
    b.tabIndex = i === 0 ? 0 : -1;
    b.addEventListener("click", () => selectRole(b));
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); selectRole(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  // ------------------------------------------------------------ schools (from the School Hub server)
  let schoolsData = null, schoolsState = "loading";
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const MOTIF = {
    book: '<path d="M22 38c4-2 7-2 10 0 3-2 6-2 10 0V26c-4-2-7-2-10 0-3-2-6-2-10 0Z" fill="#fff" opacity=".9"/><path d="M32 26v12" stroke="COLOR" stroke-width="1.4"/>',
    star: '<path d="m32 23 2.6 5.4 5.9.8-4.3 4.1 1 5.8L32 36.4l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8Z" fill="#fff" opacity=".9"/>',
    lamp: '<path d="M25 37h14c-1 2-3 3-7 3s-6-1-7-3Zm7-12c2 3 3 5 3 7a3 3 0 0 1-6 0c0-2 1-4 3-7Z" fill="#fff" opacity=".9"/>',
    leaf: '<path d="M24 39c0-9 6-14 16-15-1 10-6 16-15 16Zm1 0 9-9" fill="#fff" opacity=".9" stroke="COLOR" stroke-width="1.2"/>',
  };
  function crestSvg(c) {
    const col = /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : "#1E40AF";
    const shape = c.shape === "circle" ? '<circle cx="32" cy="32" r="29" fill="COLOR"/><circle cx="32" cy="32" r="24.5" fill="none" stroke="#F2A900" stroke-width="2"/>'
      : c.shape === "hex" ? '<path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill="COLOR"/><path d="M32 8.5 52 20v24L32 55.5 12 44V20Z" fill="none" stroke="#F2A900" stroke-width="2"/>'
      : '<path d="M32 3 56 11v20c0 15-10 25-24 30C18 56 8 46 8 31V11Z" fill="COLOR"/><path d="M32 8 51 14.5V31c0 12-8 20.5-19 25-11-4.5-19-13-19-25V14.5Z" fill="none" stroke="#F2A900" stroke-width="2"/>';
    const motif = (MOTIF[c.motif] || MOTIF.book);
    const ini = esc((c.initials || "S").slice(0, 2));
    return ('<svg viewBox="0 0 64 64" aria-hidden="true">' + shape + '<g transform="translate(0 -9) scale(1)">' + motif + "</g>" +
      '<text x="32" y="50" text-anchor="middle" font-family="Martel, Georgia, serif" font-weight="800" font-size="13" fill="#fff">' + ini + "</text></svg>")
      .replace(/COLOR/g, col);
  }
  function renderSchools() {
    const list = $("#crests"), note = $("#schools-note");
    if (schoolsState === "loading") return;
    if (schoolsState === "waking") { note.textContent = t("sc.waking"); return; }
    if (schoolsState === "error") { list.innerHTML = ""; note.textContent = t("sc.error"); return; }
    const s = schoolsData.schools || [];
    list.innerHTML = s.map((x) => '<li class="crest">' + crestSvg(x.crest || {}) + "<div><h3>" + esc(x.name) + "</h3><p>" +
      esc([x.city, x.board].filter(Boolean).join(", ")) + (x.since ? (x.city || x.board ? " — " : "") + esc(t("sc.since", { y: x.since })) : "") + "</p>" +
      (x.demo ? '<span class="tag">' + esc(t("sc.demo")) + "</span>" : "") + "</div></li>").join("");
    note.textContent = s.length ? "" : t("sc.empty");
    const st = schoolsData.stats || {};
    if (st.schools > 0) {
      $("#stats").hidden = false;
      const fmt = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN");
      ["schools", "students", "teachers", "parents"].forEach((k) => { $("#st-" + k).textContent = fmt.format(st[k] || 0); });
    }
  }
  function loadSchools(attempt) {
    const ctrl = new AbortController();
    const wake = setTimeout(() => { if (schoolsState === "loading") { schoolsState = "waking"; renderSchools(); } }, 4000);
    const stop = setTimeout(() => ctrl.abort(), 70000);       // the free server can take ~1 minute to wake up
    fetch(API + "/public/schools", { signal: ctrl.signal })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => { schoolsData = d; schoolsState = "ok"; renderSchools(); })
      .catch(() => {
        if (attempt < 1) return loadSchools(attempt + 1);
        schoolsState = "error"; renderSchools();
      })
      .finally(() => { clearTimeout(wake); clearTimeout(stop); });
  }
  loadSchools(0);

  // ------------------------------------------------------------ download: newest build from the release page
  let build = null, sizeMb = null;
  function renderBuild() {
    if (build) $("#dl-build").textContent = t("d.build", { n: build });
    if (sizeMb) $("#dl-size").textContent = sizeMb + " MB";
  }
  fetch(RELEASE, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d) return;
      const m = /Build (\d+)/.exec(d.body || "");
      if (m) build = m[1];
      const apk = (d.assets || []).find((a) => /\.apk$/i.test(a.name));
      if (apk) { sizeMb = Math.round(apk.size / 1048576); $("#dl-btn").href = apk.browser_download_url; }
      renderBuild();
    })
    .catch(() => { /* keep the default link */ });

  applyLang(false);
})();
