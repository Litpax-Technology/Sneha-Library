// ===== Gaana Pehchano — Diwali Night =====

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const COLORS = ["#ff3d7f", "#ffb020", "#7b5cff", "#16a39a", "#ff6b3d", "#c0399b", "#3d8bfd", "#e0b100", "#2bb673", "#b5651d"];
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage band */ } }
};
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function parseYtId(str) {
  if (!str) return "";
  str = String(str).trim();
  if (/^[\w-]{11}$/.test(str)) return str;
  const m = str.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? m[1] : "";
}
function hasStart(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- YouTube songs (config + browser changes) ----------
function loadSongs() {
  const ov = store.get("gp_overrides", {});
  const custom = store.get("gp_custom", []);
  const base = SONGS.map((s, i) => ({ ...s, key: "b" + i, ...(ov["b" + i] || {}) }));
  const extra = custom.map((s, i) => ({ ...s, key: "c" + i, custom: true }));
  return [...base, ...extra].map((s) => ({ ...s, id: parseYtId(s.yt), src: "youtube" }));
}
let songs = loadSongs();
const songStatus = {};      // key -> { ok, text }
const broken = new Set();   // YT video ids / local keys jo is session mein nahi chale

function updateSong(key, patch) {
  if (key.startsWith("c")) {
    const custom = store.get("gp_custom", []);
    const i = +key.slice(1);
    if (custom[i]) Object.assign(custom[i], patch);
    store.set("gp_custom", custom);
  } else {
    const ov = store.get("gp_overrides", {});
    ov[key] = { ...(ov[key] || {}), ...patch };
    store.set("gp_overrides", ov);
  }
  songs = loadSongs();
}

// ---------- Local instrumental files (IndexedDB, sirf is browser mein) ----------
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (this.db) return res(this.db);
      const r = indexedDB.open("gaana_pehchano", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("meta", { keyPath: "id" });
        r.result.createObjectStore("blobs", { keyPath: "id" });
      };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(storeName, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  all(s) { return this.tx(s, "readonly", (os) => os.getAll()); },
  get(s, id) { return this.tx(s, "readonly", (os) => os.get(id)); },
  put(s, obj) { return this.tx(s, "readwrite", (os) => os.put(obj)); },
  del(s, id) { return this.tx(s, "readwrite", (os) => os.delete(id)); }
};

let localTracks = [];
const urlCache = {};

async function loadLocalTracks() {
  try { localTracks = (await idb.all("meta")) || []; } catch (e) { localTracks = []; }
  localTracks.sort((a, b) => a.added - b.added);
}
function localSong(t) {
  return { key: "f" + t.id, fid: t.id, src: "local", title: t.title, singer: t.singer || "", movie: t.movie || "", lang: t.lang, start: t.start };
}
function parseFileName(name) {
  let base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  base = base.replace(/[\[(][^\])]*[\])]/g, " ")
    .replace(/\b(instrumental|karaoke|official|audio|video|lyrics?|flute|piano|guitar|cover|version|hd|4k|full song|song)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  const parts = base.split(/\s+[-–|]\s+/);
  return { title: (parts[0] || base).trim(), singer: (parts[1] || "").trim() };
}
function matchConfigSong(title) {
  const n = norm(title);
  if (!n) return null;
  return SONGS.find((s) => norm(s.title) === n) || SONGS.find((s) => n.includes(norm(s.title)) && norm(s.title).length > 3) || null;
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => (f.type || "").startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(f.name));
  if (!files.length) return toast("Isme koi audio file nahi mili");
  const langPick = $("#uploadLang").value;
  let added = 0;
  for (const f of files) {
    const p = parseFileName(f.name);
    const m = matchConfigSong(p.title);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const meta = {
      id,
      added: Date.now() + added,
      file: f.name,
      title: m ? m.title : p.title,
      singer: p.singer || (m ? m.singer : ""),
      movie: m ? m.movie : "",
      lang: langPick !== "auto" ? langPick : (m ? m.lang : "Hindi"),
      start: null
    };
    try {
      await idb.put("blobs", { id, blob: f });
      await idb.put("meta", meta);
      added++;
    } catch (e) {
      toast("Browser mein jagah kam pad gayi — kuch files add nahi hui", 4000);
      break;
    }
  }
  await loadLocalTracks();
  renderLocalTable();
  renderSetup();
  if (added) toast(`🎵 ${added} files add ho gayi`);
}
async function updateTrack(id, patch) {
  const t = localTracks.find((x) => x.id === id);
  if (!t) return;
  Object.assign(t, patch);
  try { await idb.put("meta", t); } catch (e) { toast("Save nahi hua"); }
}
async function getLocalUrl(fid) {
  if (urlCache[fid]) return urlCache[fid];
  const rec = await idb.get("blobs", fid);
  if (!rec || !rec.blob) throw new Error("missing");
  urlCache[fid] = URL.createObjectURL(rec.blob);
  return urlCache[fid];
}

// ---------- State ----------
const state = {
  settings: {
    source: CONFIG.DEFAULT_SOURCE || "local",
    count: CONFIG.DEFAULT_COUNT,
    clip: CONFIG.DEFAULT_CLIP,
    lang: "Mix",
    replay: CONFIG.REPLAY_LIMIT,
    ...store.get("gp_settings2", {})
  },
  game: null,
  view: "setup"
};
function saveSettings() { store.set("gp_settings2", state.settings); }

function playableSongs() {
  const lang = state.settings.lang;
  const okLang = (s) => lang === "Mix" || s.lang === lang;
  if (state.settings.source === "local") {
    return localTracks.map(localSong).filter((s) => okLang(s) && !broken.has(s.key));
  }
  return songs.filter((s) => s.id && !broken.has(s.id) && okLang(s));
}

// ---------- Navigation ----------
function showView(v) {
  state.view = v;
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + v).classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav !== "intro" && (t.dataset.nav === "songs") === (v === "songs")));
  if (v === "songs") { renderSongTable(); renderLocalTable(); }
  if (v === "setup") renderSetup();
  window.scrollTo(0, 0);
}
function goToGameArea() {
  if (!state.game) showView("setup");
  else { showView("game"); renderGame(); }
}
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  const nav = t.dataset.nav;
  if (nav === "intro") return startIntro();
  if (nav === "songs") {
    if (state.game && ["playing", "loading"].includes(state.game.phase)) { stopAudio(); state.game.phase = "played"; }
    return showView("songs");
  }
  goToGameArea();
}));

// ---------- Setup ----------
function renderSetup() {
  setSeg("#sourceSeg", state.settings.source);
  setSeg("#countSeg", state.settings.count);
  setSeg("#clipSeg", state.settings.clip);
  setSeg("#langSeg", state.settings.lang);
  setSeg("#replaySeg", state.settings.replay);

  const pool = playableSongs();
  let info;
  if (state.settings.source === "local") {
    const h = localTracks.filter((t) => t.lang === "Hindi").length;
    const p = localTracks.filter((t) => t.lang === "Punjabi").length;
    info = localTracks.length
      ? `📁 ${pool.length} instrumental tunes ready (Hindi ${h}, Punjabi ${p}). Bina ads, bina internet.`
      : `📁 Abhi koi file nahi. Songs tab mein instrumental mp3 files daalo, ya YouTube chuno.`;
  } else {
    info = `▶ ${pool.length} YouTube gaane ready. Ad aaya toh awaaz mute karke wait karega.`;
  }
  $("#songCountInfo").textContent = info;
}
function setSeg(sel, val) {
  $$(sel + " button").forEach((b) => b.classList.toggle("on", String(b.dataset.v) === String(val)));
}
function bindSeg(sel, key, isNum) {
  $(sel).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.settings[key] = isNum ? +b.dataset.v : b.dataset.v;
    saveSettings();
    renderSetup();
  });
}
bindSeg("#sourceSeg", "source", false);
bindSeg("#countSeg", "count", true);
bindSeg("#clipSeg", "clip", true);
bindSeg("#langSeg", "lang", false);
bindSeg("#replaySeg", "replay", true);
$("#startBtn").addEventListener("click", startGame);

// ---------- Game (koi team nahi — bas tune bajao, sab milke pehchano) ----------
function startGame() {
  const pool = playableSongs();
  if (!pool.length) {
    return toast(state.settings.source === "local"
      ? "Is language ki koi file nahi — Songs tab mein instrumental files daalo"
      : "Is language mein koi link wala gaana nahi — Songs tab mein link daalo", 3500);
  }
  if (state.settings.source === "youtube" && !ytReady) toast("YouTube player load ho raha hai… internet on rakho");
  const total = state.settings.count ? Math.min(state.settings.count, pool.length) : pool.length;
  state.game = { total, done: 0, song: null, phase: "ready", played: new Set(), replaysLeft: 0, failCount: 0, adWait: false };
  showView("game");
  renderGame();
}

function renderGame() {
  const g = state.game;
  if (!g) return;
  const no = g.phase === "ready" && !g.song ? g.done + 1 : Math.max(1, g.phase === "reveal" ? g.done : g.done + 1);
  $("#songNo").textContent = `Gaana ${Math.min(no, g.total)} / ${g.total}`;

  $("#record").classList.toggle("spin", g.phase === "playing");
  $("#tonearm").classList.toggle("on", ["loading", "playing"].includes(g.phase));
  $("#reveal").classList.toggle("hidden", g.phase !== "reveal");
  $(".deck").classList.toggle("revealed", g.phase === "reveal");
  $(".deck").classList.toggle("playing", g.phase === "playing");

  const cd = $("#countdown");
  if (g.phase === "ready") cd.textContent = "🎶";
  if (g.phase === "loading") cd.textContent = g.adWait ? "📺" : "…";
  if (g.phase === "played") cd.textContent = "⏸";
  if (g.phase === "reveal") cd.textContent = "✨";
  if (g.phase === "ready" || g.phase === "loading") $("#progressBar").style.width = "0";

  $("#status").innerHTML = {
    ready: g.done === 0 ? "Sab taiyaar? Kaan khol ke suniye 👂" : "Agli tune ke liye taiyaar? 👂",
    loading: "Tune lag rahi hai…" + (g.adWait ? `<span class="ad">📺 YouTube ad chal raha hai, awaaz band hai — bas aa raha hai…</span>` : ""),
    playing: "🎧 Kaunsa gaana hai?",
    played: "🤔 Pehchana? Jaldi bolo!",
    reveal: ""
  }[g.phase] || "";

  if (g.phase === "reveal" && g.song) {
    const s = g.song;
    const quips = PARTY.QUIPS || [];
    const q = quips.length ? fillNames(quips[Math.floor(Math.random() * quips.length)]) : "";
    $("#reveal").innerHTML = `
      <div class="song-title">🎶 ${esc(s.title)}</div>
      <div class="song-meta">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div>
      <span class="tag">${esc(s.lang)}</span>
      ${q ? `<div class="quip">${esc(q)}</div>` : ""}`;
  }
  renderControls();
}

function renderControls() {
  const g = state.game;
  const B = (id, text, cls = "", dis = false) => `<button class="btn ${cls}" data-act="${id}" ${dis ? "disabled" : ""}>${text}</button>`;
  const last = g.done >= g.total;
  let html = "";
  switch (g.phase) {
    case "ready": html = B("play", "▶ Tune bajao", "hero"); break;
    case "loading": html = B("skip", "⏭ Doosri tune", "ghost"); break;
    case "playing": html = B("stop", "⏹ Rok do", "ghost"); break;
    case "played":
      html = B("replay", `🔁 Dobara suno (${g.replaysLeft})`, "ghost", g.replaysLeft <= 0) +
             B("reveal", "👀 Answer dikhao", "hero") +
             B("skip", "⏭ Skip", "ghost");
      break;
    case "reveal":
      html = (last ? B("finish", "🎆 Party khatam karo", "hero") : B("next", "▶ Agla gaana", "hero")) +
             B("more", "🔊 Thoda aur suno", "ghost");
      break;
  }
  $("#controls").innerHTML = html;
}

$("#controls").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const g = state.game;
  switch (b.dataset.act) {
    case "play":
    case "next": g.failCount = 0; stopAudio(); playNewSong(); break;
    case "skip": stopAudio(); g.failCount = 0; playNewSong(); break;
    case "stop": endClip(); break;
    case "replay": if (g.replaysLeft > 0) { g.replaysLeft--; startClip(true); } break;
    case "reveal":
      stopAudio();
      g.done++;
      g.phase = "reveal";
      renderGame();
      { const r = $("#reveal").getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 10, 70); }
      break;
    case "more": playMore(); break;
    case "finish": startOutro(); break;
  }
});

$("#endGameBtn").addEventListener("click", () => {
  if (confirm("Party ka game khatam karke ending dikhayein?")) startOutro();
});
// ---------- Playback (local files + YouTube) ----------
let player = null;
let ytReady = false;
let pending = null;            // "game" | "test" | "check" | "more"
let loadTimer, stopTimer, tickTimer, adPoll;
let checkResolve = null;
let testKey = null;
const audio = $("#localAudio");

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("yt", {
    width: "200",
    height: "200",
    playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3, modestbranding: 1 },
    events: {
      onReady: () => { ytReady = true; try { player.setVolume(100); } catch (e) {} },
      onStateChange: onPlayerState,
      onError: onPlayerError
    }
  });
};

function clearTimers() {
  clearTimeout(loadTimer);
  clearTimeout(stopTimer);
  clearInterval(tickTimer);
  clearInterval(adPoll);
}
function pauseAll() {
  try { if (player && ytReady) player.pauseVideo(); } catch (e) {}
  try { audio.pause(); } catch (e) {}
}
function stopAudio() {
  clearTimers();
  pending = null;
  pauseAll();
}

function pickSong() {
  const g = state.game;
  let pool = playableSongs().filter((s) => !g.played.has(s.key));
  if (!pool.length) {
    g.played.clear();
    pool = playableSongs();
    if (pool.length) toast("Saare gaane baj gaye — list dobara shuru");
  }
  if (!pool.length) return null;
  const s = { ...pool[Math.floor(Math.random() * pool.length)] };
  if (s.src === "youtube") s.startUsed = hasStart(s.start) ? +s.start : randInt(CONFIG.RANDOM_START_MIN, CONFIG.RANDOM_START_MAX);
  else s.startUsed = null; // file ki length dekh ke tay hoga
  return s;
}

function playNewSong() {
  const g = state.game;
  const s = pickSong();
  if (!s) { g.phase = "ready"; renderGame(); return toast("Koi chalne wala gaana nahi bacha. Songs tab check karo."); }
  g.song = s;
  g.played.add(s.key);
  g.replaysLeft = state.settings.replay;
  startClip(false);
}

function startClip(isReplay) {
  const g = state.game;
  clearTimers();
  g.adWait = false;
  pending = "game";
  g.phase = "loading";
  renderGame();
  if (g.song.src === "local") return startLocalClip();
  startYtClip(isReplay);
}

// Common: asli gaana shuru ho gaya → clip timer chalao
function beginClip() {
  const g = state.game;
  pending = null;
  clearTimeout(loadTimer);
  clearInterval(adPoll);
  g.adWait = false;
  g.phase = "playing";
  renderGame();
  runCountdown(state.settings.clip);
  stopTimer = setTimeout(endClip, state.settings.clip * 1000);
}

// --- Local file ---
function waitMeta(a) {
  return new Promise((res, rej) => {
    if (a.readyState >= 1) return res();
    const ok = () => { off(); res(); };
    const bad = () => { off(); rej(new Error("load")); };
    const off = () => { a.removeEventListener("loadedmetadata", ok); a.removeEventListener("error", bad); };
    a.addEventListener("loadedmetadata", ok);
    a.addEventListener("error", bad);
  });
}
async function startLocalClip() {
  const g = state.game;
  const s = g.song;
  loadTimer = setTimeout(() => { if (pending === "game") onSongFail("File load nahi hui"); }, CONFIG.LOAD_TIMEOUT_MS);
  try {
    const url = await getLocalUrl(s.fid);
    if (pending !== "game") return;
    if (audio.dataset.fid !== String(s.fid)) {
      audio.src = url;
      audio.dataset.fid = s.fid;
      await waitMeta(audio);
    }
    const d = isFinite(audio.duration) ? audio.duration : 180;
    if (s.startUsed == null) {
      s.startUsed = hasStart(s.start) ? +s.start : randInt(Math.floor(d * 0.15), Math.max(Math.floor(d * 0.15), Math.floor(d * 0.55)));
    }
    audio.currentTime = Math.max(0, Math.min(s.startUsed, d - state.settings.clip - 1));
    await audio.play();
    if (pending !== "game") { audio.pause(); return; }
    beginClip();
  } catch (e) {
    if (pending === "game") onSongFail("File nahi chali");
  }
}

// --- YouTube (ad aaye toh mute + wait) ---
function startYtClip(isReplay) {
  const g = state.game;
  if (!ytReady) {
    pending = null;
    g.phase = g.replaysLeft < state.settings.replay ? "played" : "ready";
    renderGame();
    return toast("YouTube player abhi ready nahi — internet check karo");
  }
  try { player.mute(); } catch (e) {}
  if (isReplay) {
    player.seekTo(g.song.startUsed, true);
    player.playVideo();
  } else {
    player.loadVideoById({ videoId: g.song.id, startSeconds: g.song.startUsed });
  }
  watchForContent();
}
// Ad ke time video ka apna time aage nahi badhta. Jab time start ke paas badhne lage tab hi asli gaana maana jata hai.
function watchForContent() {
  const g = state.game;
  const start = g.song.startUsed;
  const t0 = Date.now();
  let lastT = null, adv = 0;
  clearInterval(adPoll);
  adPoll = setInterval(() => {
    if (pending !== "game") { clearInterval(adPoll); return; }
    let t = 0, st = -1;
    try { t = player.getCurrentTime(); st = player.getPlayerState(); } catch (e) {}
    if (st === 1 && lastT !== null && t > lastT + 0.05 && t >= start - 1.5 && t <= start + 6) adv++;
    else adv = 0;
    lastT = t;
    const elapsed = Date.now() - t0;
    if (adv >= 2) {
      clearInterval(adPoll);
      try { player.unMute(); player.setVolume(100); } catch (e) {}
      beginClip();
      return;
    }
    if (!g.adWait && elapsed > 2500 && (st === 1 || st === 3)) { g.adWait = true; renderGame(); }
    if (elapsed > CONFIG.LOAD_TIMEOUT_MS && (st === -1 || st === 5)) { clearInterval(adPoll); onSongFail("Load nahi hua"); return; }
    if (elapsed > CONFIG.AD_WAIT_MS) { clearInterval(adPoll); onSongFail("Ad bahut lamba tha"); }
  }, 200);
}

function onPlayerState(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    if (pending === "test") {
      pending = null;
      clearTimeout(loadTimer);
      const s = songs.find((x) => x.key === testKey);
      if (s) { songStatus[s.key] = { ok: true, text: "✅ " + (player.getVideoData()?.title || "Chal raha hai") }; broken.delete(s.id); renderStatusCell(s.key); }
      stopTimer = setTimeout(() => { try { player.pauseVideo(); } catch (err) {} }, 5000);
    } else if (pending === "more") {
      pending = null;
      clearTimeout(loadTimer);
      stopTimer = setTimeout(() => { try { player.pauseVideo(); } catch (err) {} }, 15000);
    }
  }
  if (e.data === S.CUED && pending === "check" && checkResolve) {
    const title = (player.getVideoData && player.getVideoData().title) || "";
    checkResolve({ ok: true, text: "✅ " + (title || "Link sahi hai") });
  }
}

function onPlayerError(e) {
  const reason = { 2: "Galat link", 5: "Play nahi hua", 100: "Video hat gaya / private", 101: "Embed band hai", 150: "Embed band hai", 153: "Player error (file:// se mat kholo)" }[e.data] || "Error " + e.data;
  if (pending === "check" && checkResolve) return checkResolve({ ok: false, text: "❌ " + reason });
  if (pending === "test") {
    pending = null; clearTimers();
    const s = songs.find((x) => x.key === testKey);
    if (s) { songStatus[s.key] = { ok: false, text: "❌ " + reason }; broken.add(s.id); renderStatusCell(s.key); }
    return toast("❌ " + reason);
  }
  if (state.game && state.game.song && state.game.song.src === "youtube" &&
      (pending === "game" || state.game.phase === "playing")) onSongFail(reason);
}

function onSongFail(reason) {
  const g = state.game;
  clearTimers();
  pending = null;
  pauseAll();
  if (g.song) {
    broken.add(g.song.src === "local" ? g.song.key : g.song.id);
    songStatus[g.song.key] = { ok: false, text: "❌ " + reason };
  }
  g.failCount++;
  if (g.failCount >= 5) {
    g.phase = "ready";
    renderGame();
    return toast("Gaane chal nahi rahe — Songs tab mein files/links check karo", 4000);
  }
  toast(`"${g.song ? g.song.title : "Gaana"}" nahi chala (${reason}) — doosra laga rahe hain`);
  playNewSong();
}

function endClip() {
  const g = state.game;
  clearTimers();
  pending = null;
  pauseAll();
  $("#progressBar").style.width = "100%";
  g.phase = "played";
  renderGame();
}

function runCountdown(sec) {
  let left = sec;
  const t0 = performance.now();
  $("#countdown").textContent = left;
  const bar = $("#progressBar");
  bar.style.transition = "none";
  bar.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `width ${sec}s linear`;
    bar.style.width = "100%";
  }));
  tickTimer = setInterval(() => {
    left = Math.max(0, sec - Math.floor((performance.now() - t0) / 1000));
    $("#countdown").textContent = left;
  }, 200);
}

function playMore() {
  const g = state.game;
  if (!g.song) return;
  clearTimers();
  if (g.song.src === "local") {
    try {
      audio.currentTime = g.song.startUsed || 0;
      audio.play().catch(() => {});
      stopTimer = setTimeout(() => audio.pause(), 15000);
    } catch (e) {}
    return;
  }
  if (!ytReady) return;
  try { player.unMute(); player.seekTo(g.song.startUsed, true); player.playVideo(); } catch (e) {}
  stopTimer = setTimeout(() => { try { player.pauseVideo(); } catch (err) {} }, 15000);
}

// ---------- Songs screen: local files ----------
function renderLocalTable() {
  const body = $("#localTable tbody");
  $("#localSummary").textContent = localTracks.length ? `(${localTracks.length} files)` : "";
  if (!localTracks.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">Abhi koi file nahi — upar "Files chuno" ya "Poora folder" dabao</td></tr>`;
    return;
  }
  body.innerHTML = localTracks.map((t, i) => {
    const key = "f" + t.id;
    const st = songStatus[key] ? esc(songStatus[key].text) : (broken.has(key) ? "❌ Nahi chali" : "📁 Ready");
    return `<tr data-fid="${t.id}">
      <td>${i + 1}</td>
      <td><input class="f-title" type="text" value="${esc(t.title)}" title="${esc(t.file)}"></td>
      <td><input class="f-singer" type="text" value="${esc(t.singer)}" placeholder="Singer"></td>
      <td><select class="f-lang"><option${t.lang === "Hindi" ? " selected" : ""}>Hindi</option><option${t.lang === "Punjabi" ? " selected" : ""}>Punjabi</option></select></td>
      <td><input class="start f-start" type="number" min="0" value="${hasStart(t.start) ? +t.start : ""}" placeholder="auto"></td>
      <td><span class="status">${st}</span></td>
      <td><div class="acts">
        <button data-ltest="${t.id}" title="5 sec suno">▶</button>
        <button data-ldel="${t.id}" title="Hatao">🗑</button>
      </div></td>
    </tr>`;
  }).join("");
}
$("#fileInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
$("#folderInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });

$("#localTable").addEventListener("change", (e) => {
  const tr = e.target.closest("tr[data-fid]");
  if (!tr) return;
  const id = tr.dataset.fid;
  const c = e.target.classList;
  if (c.contains("f-title")) updateTrack(id, { title: e.target.value.trim() || "Bina naam" });
  if (c.contains("f-singer")) updateTrack(id, { singer: e.target.value.trim() });
  if (c.contains("f-lang")) updateTrack(id, { lang: e.target.value }).then(renderSetup);
  if (c.contains("f-start")) updateTrack(id, { start: e.target.value === "" ? null : Math.max(0, +e.target.value) });
});
$("#localTable").addEventListener("click", async (e) => {
  const t = e.target.closest("[data-ltest]");
  if (t) {
    const tr = localTracks.find((x) => x.id === t.dataset.ltest);
    if (!tr) return;
    stopAudio();
    try {
      audio.src = await getLocalUrl(tr.id);
      audio.dataset.fid = tr.id;
      await waitMeta(audio);
      audio.currentTime = hasStart(tr.start) ? +tr.start : Math.floor((audio.duration || 100) * 0.3);
      await audio.play();
      stopTimer = setTimeout(() => audio.pause(), 5000);
      toast(`▶ ${tr.title} — 5 sec`);
    } catch (err) {
      songStatus["f" + tr.id] = { ok: false, text: "❌ File nahi chali" };
      renderLocalTable();
    }
    return;
  }
  const d = e.target.closest("[data-ldel]");
  if (d && confirm("Ye file list se hatani hai?")) {
    const id = d.dataset.ldel;
    try { await idb.del("meta", id); await idb.del("blobs", id); } catch (err) {}
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
    await loadLocalTracks();
    renderLocalTable();
    renderSetup();
  }
});

// ---------- Songs screen: YouTube ----------
function renderSongTable() {
  $("#songTable tbody").innerHTML = songs.map((s, i) => `
    <tr data-key="${s.key}">
      <td>${i + 1}</td>
      <td><div class="t">${esc(s.title)}</div><div class="s">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div></td>
      <td><span class="lang-tag ${esc(s.lang)}">${esc(s.lang)}</span></td>
      <td><input class="link" type="text" value="${esc(s.yt || "")}" placeholder="Instrumental ka link paste karo"></td>
      <td><input class="start" type="number" min="0" value="${hasStart(s.start) ? +s.start : ""}" placeholder="auto"></td>
      <td><span class="status">${statusText(s)}</span></td>
      <td><div class="acts">
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(s.title + " " + s.singer + " instrumental")}" target="_blank" rel="noopener" title="YouTube pe instrumental dhundho">🔍</a>
        <button data-test="${s.key}" title="5 sec suno">▶</button>
        ${s.custom ? `<button data-del="${s.key}" title="Hatao">🗑</button>` : ""}
      </div></td>
    </tr>`).join("");
  $("#songsSummary").textContent = `(${songs.filter((s) => s.id).length}/${songs.length} mein link hai)`;
}
function statusText(s) {
  if (!s.id) return s.yt ? "⚠️ Link samajh nahi aaya" : "⚪ Link nahi";
  if (songStatus[s.key]) return esc(songStatus[s.key].text);
  return broken.has(s.id) ? "❌ Nahi chala" : "— check nahi kiya";
}
function renderStatusCell(key) {
  const s = songs.find((x) => x.key === key);
  const cell = document.querySelector(`#songTable tr[data-key="${key}"] .status`);
  if (s && cell) cell.innerHTML = statusText(s);
}

$("#songTable").addEventListener("change", (e) => {
  const tr = e.target.closest("tr[data-key]");
  if (!tr) return;
  const key = tr.dataset.key;
  if (e.target.classList.contains("link")) {
    delete songStatus[key];
    updateSong(key, { yt: e.target.value.trim() });
    const s = songs.find((x) => x.key === key);
    if (s && s.id) broken.delete(s.id);
    if (e.target.value.trim() && !(s && s.id)) toast("Ye YouTube link sahi nahi lag raha");
    renderStatusCell(key);
    $("#songsSummary").textContent = `(${songs.filter((x) => x.id).length}/${songs.length} mein link hai)`;
  }
  if (e.target.classList.contains("start")) {
    const v = e.target.value;
    updateSong(key, { start: v === "" ? null : Math.max(0, +v) });
  }
});

$("#songTable").addEventListener("click", (e) => {
  const t = e.target.closest("[data-test]");
  if (t) {
    const s = songs.find((x) => x.key === t.dataset.test);
    if (!s || !s.id) return toast("Pehle link daalo");
    if (!ytReady) return toast("YouTube player abhi ready nahi");
    stopAudio();
    pending = "test";
    testKey = s.key;
    try { player.unMute(); } catch (err) {}
    player.loadVideoById({ videoId: s.id, startSeconds: hasStart(s.start) ? +s.start : 40 });
    loadTimer = setTimeout(() => { if (pending === "test") { pending = null; songStatus[s.key] = { ok: null, text: "⚠️ Load nahi hua" }; renderStatusCell(s.key); } }, CONFIG.LOAD_TIMEOUT_MS);
    toast(`▶ ${s.title} — 5 sec`);
    return;
  }
  const d = e.target.closest("[data-del]");
  if (d && confirm("Ye gaana hatana hai?")) {
    const custom = store.get("gp_custom", []);
    custom.splice(+d.dataset.del.slice(1), 1);
    store.set("gp_custom", custom);
    songs = loadSongs();
    renderSongTable();
  }
});

$("#checkAllBtn").addEventListener("click", async () => {
  if (!ytReady) return toast("YouTube player abhi ready nahi");
  const btn = $("#checkAllBtn");
  btn.disabled = true;
  stopAudio();
  const list = songs.filter((s) => s.id);
  let ok = 0, bad = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    btn.textContent = `Check ho raha hai ${i + 1}/${list.length}…`;
    const r = await checkOne(s);
    songStatus[s.key] = r;
    if (r.ok === false) { broken.add(s.id); bad++; } else if (r.ok) { broken.delete(s.id); ok++; }
    renderStatusCell(s.key);
  }
  pending = null;
  try { player.stopVideo(); } catch (e) {}
  btn.disabled = false;
  btn.textContent = "✅ Sab check karo";
  toast(`Check ho gaya: ${ok} sahi, ${bad} problem. Title match zaroor dekh lena.`, 4000);
});
function checkOne(s) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => done({ ok: null, text: "⚠️ Timeout" }), 8000);
    function done(r) { clearTimeout(timer); checkResolve = null; setTimeout(() => resolve(r), 250); }
    checkResolve = done;
    pending = "check";
    try { player.cueVideoById({ videoId: s.id, startSeconds: 0 }); }
    catch (e) { done({ ok: null, text: "⚠️ Check nahi hua" }); }
  });
}

$("#copyConfigBtn").addEventListener("click", () => {
  const line = (s) => `  { title: ${JSON.stringify(s.title)}, singer: ${JSON.stringify(s.singer || "")}, movie: ${JSON.stringify(s.movie || "")}, lang: ${JSON.stringify(s.lang)}, yt: ${JSON.stringify(s.id || "")}, start: ${hasStart(s.start) ? +s.start : "null"} }`;
  const txt = "const SONGS = [\n" + songs.map(line).join(",\n") + "\n];\n";
  const done = () => toast("📋 Copy ho gaya — config.js mein SONGS wala hissa replace kar do");
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  else fallbackCopy(txt, done);
});
function fallbackCopy(txt, cb) {
  const ta = document.createElement("textarea");
  ta.value = txt;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); cb(); } catch (e) { toast("Copy nahi hua"); }
  ta.remove();
}
$("#resetChangesBtn").addEventListener("click", () => {
  if (!confirm("YouTube list ke saare browser changes (links + naye gaane) hata dein? config.js wali list wapas aa jayegi.")) return;
  store.set("gp_overrides", {});
  store.set("gp_custom", []);
  songs = loadSongs();
  Object.keys(songStatus).forEach((k) => { if (!k.startsWith("f")) delete songStatus[k]; });
  renderSongTable();
  toast("Reset ho gaya");
});
$("#addSongBtn").addEventListener("click", () => {
  const title = $("#newTitle").value.trim();
  const link = $("#newLink").value.trim();
  if (!title) return toast("Gaane ka naam daalo");
  if (!parseYtId(link)) return toast("Sahi YouTube link daalo");
  const startV = $("#newStart").value;
  const custom = store.get("gp_custom", []);
  custom.push({ title, singer: $("#newSinger").value.trim(), movie: $("#newMovie").value.trim(), lang: $("#newLang").value, yt: link, start: startV === "" ? null : Math.max(0, +startV) });
  store.set("gp_custom", custom);
  songs = loadSongs();
  ["#newTitle", "#newSinger", "#newMovie", "#newLink", "#newStart"].forEach((s) => ($(s).value = ""));
  renderSongTable();
  toast(`➕ "${title}" add ho gaya`);
});

// ---------- Fireworks ----------
const fx = { c: $("#fx"), ctx: null, parts: [], rockets: [], running: false, auto: false, lastLaunch: 0, dpr: 1 };
fx.ctx = fx.c.getContext("2d");
const FX_COLORS = ["#ffc24b", "#ff8a1f", "#ff3d7f", "#ffffff", "#7bdcff", "#b98bff", "#5df29a"];
function fxResize() {
  fx.dpr = Math.min(window.devicePixelRatio || 1, 2);
  fx.c.width = innerWidth * fx.dpr;
  fx.c.height = innerHeight * fx.dpr;
  fx.ctx.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
}
window.addEventListener("resize", fxResize);
fxResize();

function burst(x, y, count = 70) {
  if (REDUCED) return;
  const col = FX_COLORS[randInt(0, FX_COLORS.length - 1)];
  const col2 = FX_COLORS[randInt(0, FX_COLORS.length - 1)];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 4.5;
    fx.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.012 + Math.random() * 0.012, color: i % 3 ? col : col2, size: 1.5 + Math.random() * 2 });
  }
  startFx();
}
function launchRocket() {
  fx.rockets.push({ x: innerWidth * (0.12 + Math.random() * 0.76), y: innerHeight + 10, vy: -(innerHeight * 0.016 + Math.random() * 4), targetY: innerHeight * (0.12 + Math.random() * 0.35) });
  startFx();
}
function celebrate(n) {
  if (REDUCED) return;
  for (let i = 0; i < n; i++) setTimeout(launchRocket, i * 350);
}
function startFx() {
  if (fx.running || REDUCED) return;
  fx.running = true;
  requestAnimationFrame(fxLoop);
}
function fxLoop(t) {
  const ctx = fx.ctx;
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  ctx.globalCompositeOperation = "lighter";

  if (fx.auto && t - fx.lastLaunch > 900) { fx.lastLaunch = t; launchRocket(); }

  fx.rockets = fx.rockets.filter((r) => {
    r.y += r.vy;
    r.vy *= 0.985;
    ctx.fillStyle = "#ffe2a0";
    ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2); ctx.fill();
    if (r.y <= r.targetY || r.vy > -1.5) { burst(r.x, r.y, 80); return false; }
    return true;
  });
  fx.parts = fx.parts.filter((p) => {
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.97; p.vy = p.vy * 0.97 + 0.06;
    p.life -= p.decay;
    if (p.life <= 0) return false;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    return true;
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  if (fx.parts.length || fx.rockets.length || fx.auto) requestAnimationFrame(fxLoop);
  else { fx.running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}


// ---------- Cinematic music ----------
// 1) config.js ke MUSIC_FILES mein us mood ki mp3 ho → woh bajegi (asli instrumental)
// 2) mp3 nahi hai / load nahi hui → browser khud live music banayega (backup)
// Sound effects: SFX_FILES mein mp3 ho toh woh, warna live bane effects
const TONIC = 146.83; // D3 = Sa
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hz = (semi) => TONIC * Math.pow(2, semi / 12);
const FILE_VOL = 0.6;   // mp3 music ki volume
const DUCK = 0.4;       // dialogue chalte waqt music kitna dheema ho

const music = {
  ctx: null, out: null, bus: null, verb: null, noise: null,
  layer: null, mood: null, active: null, tracks: {}, badUrls: new Set(), tick: null,
  duckF: 1,
  on: store.get("gp_music", true),
  enabled() { return PARTY.MUSIC !== false; },
  urlFor(m) { return PARTY.INTRO_MUSIC || (PARTY.MUSIC_FILES || {})[m] || ""; },

  // Browser bina click ke awaaz nahi chalne deta — isliye kisi click pe hi unlock
  unlock() {
    if (!this.enabled()) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          const c = (this.ctx = new AC());
          this.out = c.createGain();
          this.out.gain.value = this.on ? 0.85 : 0;
          const comp = c.createDynamicsCompressor();
          comp.threshold.value = -16; comp.ratio.value = 4;
          this.out.connect(comp); comp.connect(c.destination);
          this.verb = c.createConvolver();
          this.verb.buffer = this.impulse(3.4);
          const wet = c.createGain(); wet.gain.value = 0.4;
          this.verb.connect(wet); wet.connect(this.out);
          this.bus = c.createGain();           // sirf music (ducking isi pe)
          this.bus.connect(this.out); this.bus.connect(this.verb);
          const nb = c.createBuffer(1, c.sampleRate, c.sampleRate);
          const d = nb.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
          this.noise = nb;
        }
      }
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    } catch (e) { this.ctx = null; }
    // mp3 tracks pehle se load kar lo taaki scene badalte hi turant bajein
    ["title", "funny", "love", "celebrate", "calm"].forEach((m) => this.trackFor(m));
  },
  impulse(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return b;
  },

  // --- mp3 tracks (volume fade JS se, taaki file:// pe bhi chale) ---
  trackFor(m) {
    const url = this.urlFor(m);
    if (!url || this.badUrls.has(url)) return null;
    if (this.tracks[url]) return this.tracks[url];
    const el = new Audio(url);
    el.loop = true; el.preload = "auto"; el.volume = 0;
    const tr = { el, url, cur: 0 };
    el.addEventListener("error", () => {
      this.badUrls.add(url);
      delete this.tracks[url];
      if (this.active === tr) {          // file nahi chali → live music pe shift
        this.active = null;
        if (this.mood && this.ctx && MOODS[this.mood]) this.layer = this.makeLayer(MOODS[this.mood]);
      }
    });
    return (this.tracks[url] = tr);
  },
  runTick() {
    if (this.tick) return;
    let last = performance.now();
    this.tick = setInterval(() => {
      const now = performance.now(), step = (now - last) / 1500; // ~1.5 sec fade
      last = now;
      let busy = false;
      Object.values(this.tracks).forEach((tr) => {
        const goal = tr === this.active ? FILE_VOL * this.duckF * (this.on ? 1 : 0) : 0;
        if (goal > 0 && tr.el.paused) tr.el.play().catch(() => {});
        tr.cur = tr.cur < goal ? Math.min(goal, tr.cur + step) : Math.max(goal, tr.cur - step);
        tr.el.volume = Math.max(0, Math.min(1, tr.cur));
        if (goal === 0 && tr.cur === 0 && !tr.el.paused) tr.el.pause();
        if (tr.cur !== goal || !tr.el.paused) busy = true;
      });
      if (!busy) { clearInterval(this.tick); this.tick = null; }
    }, 50);
  },

  setMood(m) {
    if (!this.enabled() || m === this.mood) return;
    this.mood = m;
    if (this.layer) { this.fadeOut(this.layer, 1.6); this.layer = null; }
    const tr = this.trackFor(m);
    if (tr && tr !== this.active && tr.cur === 0) { try { tr.el.currentTime = 0; } catch (e) {} }
    this.active = tr;
    if (!tr && this.ctx && MOODS[m]) this.layer = this.makeLayer(MOODS[m]);
    this.runTick();
  },
  stop(sec = 1.5) {
    this.mood = null;
    this.active = null;
    this.duck(false);
    if (this.layer) { this.fadeOut(this.layer, sec); this.layer = null; }
    this.runTick();
  },
  // Dialogue ke time music thoda neeche, taaki baat saaf sunai de
  duck(on) {
    this.duckF = on ? DUCK : 1;
    if (this.bus) {
      const t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(this.bus.gain.value, t);
      this.bus.gain.linearRampToValueAtTime(this.duckF, t + 0.6);
    }
    this.runTick();
  },
  toggle() {
    this.on = !this.on;
    store.set("gp_music", this.on);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(this.on ? 0.85 : 0, t + 0.4);
    }
    this.runTick();
    return this.on;
  },

  makeLayer(P) {
    const c = this.ctx, g = c.createGain(), t = c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 1.6);
    g.connect(this.bus);
    const L = { g, srcs: [], iv: null, i: 0 };
    try { if (P.setup) P.setup(this, L, t + 0.05); } catch (e) {}
    if (P.step) {
      const ms = 60000 / P.bpm / 2; // 8th note
      L.iv = setInterval(() => { try { P.step(this, L, L.i++, this.ctx.currentTime + 0.06); } catch (e) {} }, ms);
    }
    return L;
  },
  fadeOut(L, sec) {
    clearInterval(L.iv);
    const t = this.ctx.currentTime;
    L.g.gain.cancelScheduledValues(t);
    L.g.gain.setValueAtTime(L.g.gain.value, t);
    L.g.gain.linearRampToValueAtTime(0.0001, t + sec);
    setTimeout(() => {
      L.srcs.forEach((s) => { try { s.stop(); } catch (e) {} });
      try { L.g.disconnect(); } catch (e) {}
    }, sec * 1000 + 300);
  },

  // --- Instruments ---
  osc(type, f, t) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); return o; },
  env(t, a, hold, rel, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    return g;
  },
  noiseSrc(t, dur) { const n = this.ctx.createBufferSource(); n.buffer = this.noise; n.loop = true; n.start(t); n.stop(t + dur); return n; },
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },

  drone(L, semis, vol) {           // tanpura jaisa lagatar sur
    const c = this.ctx, t = c.currentTime;
    const lp = this.filter("lowpass", 650, 0.7);
    const g = c.createGain(); g.gain.value = vol;
    lp.connect(g); g.connect(L.g);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.09;
    const lg = c.createGain(); lg.gain.value = 250;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); L.srcs.push(lfo);
    semis.forEach((s) => [-5, 5].forEach((cents) => {
      const o = this.osc("sawtooth", hz(s), t); o.detune.value = cents; o.connect(lp); o.start(t); L.srcs.push(o);
    }));
  },
  pad(L, semis, t, dur, vol) {     // strings jaisa soft chord
    const lp = this.filter("lowpass", 1600);
    const e = this.env(t, 1.1, Math.max(0, dur - 1.1), 1.6, vol);
    lp.connect(e); e.connect(L.g);
    semis.forEach((s) => [-7, 7].forEach((cents) => {
      const o = this.osc("triangle", hz(s), t); o.detune.value = cents; o.connect(lp); o.start(t); o.stop(t + dur + 1.8);
    }));
  },
  pluck(L, semi, t, vol = 0.15, dec = 0.45) {   // santoor / pizzicato
    const c = this.ctx, f = hz(semi);
    const o = this.osc("triangle", f * 1.01, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const o2 = this.osc("sine", f * 2, t);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    const e = this.env(t, 0.004, 0, dec, vol);
    o.connect(e); o2.connect(g2); g2.connect(e); e.connect(L.g);
    o.start(t); o2.start(t); o.stop(t + dec + 0.1); o2.stop(t + dec + 0.1);
  },
  flute(L, semi, t, dur, vol = 0.08) {          // bansuri jaisi melody
    const c = this.ctx, f = hz(semi);
    const o = this.osc("sine", f, t);
    const vib = c.createOscillator(); vib.frequency.value = 5.2;
    const vg = c.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f * 0.012, t + 0.4);
    vib.connect(vg); vg.connect(o.frequency);
    const e = this.env(t, 0.14, dur, 0.5, vol);
    o.connect(e); e.connect(L.g);
    const bp = this.filter("bandpass", f * 2, 2);
    const ng = this.env(t, 0.05, 0.05, 0.25, vol * 0.25);
    this.noiseSrc(t, 0.4).connect(bp); bp.connect(ng); ng.connect(L.g);
    const end = t + dur + 0.7;
    o.start(t); vib.start(t); o.stop(end); vib.stop(end);
  },
  bell(L, semi, t, vol = 0.05) {
    const f = hz(semi);
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => {
      const o = this.osc("sine", f * m, t);
      const e = this.env(t, 0.003, 0, 2.6 / m + 0.4, vol * a);
      o.connect(e); e.connect(L.g); o.start(t); o.stop(t + 3.2);
    });
  },
  boom(L, t, vol = 0.5) {           // cinematic dhamaka
    const o = this.osc("sine", 72, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.4);
    const e = this.env(t, 0.01, 0.1, 2.2, vol);
    o.connect(e); e.connect(L.g); o.start(t); o.stop(t + 2.6);
    const lp = this.filter("lowpass", 220);
    const ne = this.env(t, 0.005, 0, 0.9, vol * 0.5);
    this.noiseSrc(t, 1).connect(lp); lp.connect(ne); ne.connect(L.g);
  },
  drum(L, t, kind, vol = 1) {       // dhol / tabla
    if (kind === "tin") {
      const hp = this.filter("highpass", 6000);
      const e = this.env(t, 0.002, 0, 0.06, 0.05 * vol);
      this.noiseSrc(t, 0.1).connect(hp); hp.connect(e); e.connect(L.g);
    } else if (kind === "ta") {
      const bp = this.filter("bandpass", 2200, 1.5);
      const e = this.env(t, 0.002, 0, 0.12, 0.09 * vol);
      this.noiseSrc(t, 0.2).connect(bp); bp.connect(e); e.connect(L.g);
      const o = this.osc("sine", 330, t);
      const oe = this.env(t, 0.002, 0, 0.08, 0.06 * vol);
      o.connect(oe); oe.connect(L.g); o.start(t); o.stop(t + 0.15);
    } else {
      const low = kind === "ghe";
      const o = this.osc("sine", low ? 95 : 140, t); o.frequency.exponentialRampToValueAtTime(low ? 52 : 70, t + 0.18);
      const e = this.env(t, 0.003, 0.02, low ? 0.5 : 0.3, 0.32 * vol);
      o.connect(e); e.connect(L.g); o.start(t); o.stop(t + 0.7);
      if (kind === "dha") this.drum(L, t, "ta", vol * 0.8);
    }
  },
  riser(L, t, dur, vol = 0.12) {
    const bp = this.filter("bandpass", 250, 3);
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(5000, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    this.noiseSrc(t, dur + 0.5).connect(bp); bp.connect(g); g.connect(L.g);
  },
  tone(type, f, t, dur, vol, dest, lpf) {        // ek simple note (sfx ke liye)
    const o = this.osc(type, f, t);
    const e = this.env(t, 0.01, Math.max(0, dur - 0.05), 0.15, vol);
    if (lpf) { const lp = this.filter("lowpass", lpf); o.connect(lp); lp.connect(e); } else o.connect(e);
    e.connect(dest); o.start(t); o.stop(t + dur + 0.3);
    return o;
  },
  cymbal(dest, t, vol = 0.09, dec = 1.6) {
    const hp = this.filter("highpass", 5500);
    const e = this.env(t, 0.003, 0, dec, vol);
    this.noiseSrc(t, dec + 0.2).connect(hp); hp.connect(e); e.connect(dest);
  },

  // --- Sound effects (dialogue / scene ke hisaab se) ---
  sfx(name) {
    if (!this.enabled() || !this.on || !name) return;
    const fileUrl = (PARTY.SFX_FILES || {})[name];
    if (fileUrl && !this.badUrls.has(fileUrl)) {
      const a = new Audio(fileUrl);
      a.volume = 0.85;
      a.play().catch(() => { this.badUrls.add(fileUrl); this.synthSfx(name); });
      return;
    }
    this.synthSfx(name);
  },
  synthSfx(name) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + 0.03, out = this.out, L = { g: out, srcs: [] };
    switch (name) {
      case "whoosh": {                 // scene badalte waqt
        const bp = this.filter("bandpass", 400, 1.2);
        bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.35); bp.frequency.exponentialRampToValueAtTime(700, t + 0.7);
        const e = this.env(t, 0.25, 0.1, 0.4, 0.13);
        const pan = c.createStereoPanner ? c.createStereoPanner() : null;
        const src = this.noiseSrc(t, 0.9);
        src.connect(bp); bp.connect(e);
        if (pan) { pan.pan.setValueAtTime(-0.8, t); pan.pan.linearRampToValueAtTime(0.8, t + 0.7); e.connect(pan); pan.connect(out); } else e.connect(out);
        break;
      }
      case "pop": {                    // bubble aaya
        const o = this.osc("sine", 520, t); o.frequency.exponentialRampToValueAtTime(1100, t + 0.06);
        const e = this.env(t, 0.004, 0, 0.09, 0.07);
        o.connect(e); e.connect(out); o.start(t); o.stop(t + 0.15);
        break;
      }
      case "boing": {                  // comedy spring
        const o = this.osc("sine", 160, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.12); o.frequency.exponentialRampToValueAtTime(220, t + 0.7);
        const v = c.createOscillator(); v.frequency.value = 16;
        const vg = c.createGain(); vg.gain.setValueAtTime(90, t); vg.gain.exponentialRampToValueAtTime(1, t + 0.7);
        v.connect(vg); vg.connect(o.frequency);
        const e = this.env(t, 0.01, 0.15, 0.55, 0.13);
        o.connect(e); e.connect(out); o.start(t); v.start(t); o.stop(t + 0.9); v.stop(t + 0.9);
        break;
      }
      case "rimshot": {                // ba-dum-tss (joke ke baad)
        [[0, 190, 120], [0.17, 140, 90]].forEach(([dt, f0, f1]) => {
          const o = this.osc("sine", f0, t + dt); o.frequency.exponentialRampToValueAtTime(f1, t + dt + 0.15);
          const e = this.env(t + dt, 0.003, 0.02, 0.25, 0.28);
          o.connect(e); e.connect(out); o.start(t + dt); o.stop(t + dt + 0.4);
          const bp = this.filter("bandpass", 1800, 1);
          const ne = this.env(t + dt, 0.002, 0, 0.1, 0.08);
          this.noiseSrc(t + dt, 0.15).connect(bp); bp.connect(ne); ne.connect(out);
        });
        this.cymbal(out, t + 0.36, 0.11, 1.3);
        break;
      }
      case "dun": {                    // dun dun duuun (dramatic)
        [[0, 0, 0.22], [0.32, 0, 0.22], [0.64, -4, 1.5]].forEach(([dt, s, d]) => {
          [s - 12, s - 5, s].forEach((x) => this.tone("sawtooth", hz(x), t + dt, d, 0.05, out, 900));
        });
        this.boom(L, t + 0.64, 0.45);
        break;
      }
      case "scratch": {                // record scratch — music ruk jaata hai
        const bp = this.filter("bandpass", 900, 4);
        [[0, 900], [0.08, 2600], [0.16, 700], [0.26, 2200], [0.38, 500]].forEach(([dt, f]) => bp.frequency.linearRampToValueAtTime(f, t + dt));
        const e = this.env(t, 0.01, 0.3, 0.12, 0.2);
        this.noiseSrc(t, 0.5).connect(bp); bp.connect(e); e.connect(out);
        if (this.bus) {
          this.bus.gain.cancelScheduledValues(t);
          this.bus.gain.setValueAtTime(0.0001, t + 0.05);
          this.bus.gain.linearRampToValueAtTime(this.duckF, t + 2.2);
        }
        if (this.active) { this.active.cur = 0; this.active.el.volume = 0; this.runTick(); }
        break;
      }
      case "tick": this.bell(L, 24, t, 0.05); this.bell(L, 31, t + 0.07, 0.035); break;
      case "buzz":
        [0, 0.2].forEach((dt) => this.tone("square", 110, t + dt, 0.14, 0.05, out, 1400));
        break;
      case "heartbeat":
        [0, 0.9, 1.8].forEach((k) => [0, 0.22].forEach((dt, j) => {
          const s = t + k + dt, o = this.osc("sine", j ? 55 : 65, s);
          o.frequency.exponentialRampToValueAtTime(38, s + 0.15);
          const e = this.env(s, 0.005, 0.02, 0.25, j ? 0.3 : 0.4);
          o.connect(e); e.connect(out); o.start(s); o.stop(s + 0.35);
        }));
        break;
      case "sparkle":
        for (let k = 0; k < 7; k++) this.bell(L, pick([24, 26, 28, 31, 33, 36]), t + k * 0.07 + Math.random() * 0.03, 0.035);
        break;
      case "harp":                     // romantic gliss
        [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28].forEach((s, k) => this.pluck(L, s, t + k * 0.06, 0.06, 1.6));
        break;
      case "tada": {                   // drumroll + dhamaka + chord
        for (let k = 0; k < 18; k++) {
          const s = t + 1.1 * (1 - Math.pow(1 - k / 18, 1.6));
          this.drum(L, s, "ta", 0.4 + k * 0.035);
        }
        const hit = t + 1.2;
        this.boom(L, hit, 0.45);
        this.cymbal(out, hit, 0.12, 2);
        [12, 16, 19, 24].forEach((s) => this.bell(L, s + 12, hit, 0.05));
        [0, 4, 7, 12].forEach((s) => this.tone("sawtooth", hz(s), hit, 0.9, 0.035, out, 2200));
        break;
      }
      case "mindblown":
        this.boom(L, t, 0.4);
        this.sfx("sparkle");
        break;
      case "ting": [24, 31, 36].forEach((s, k) => this.bell(L, s, t + k * 0.09, 0.07)); break;
      case "aww": [19, 24, 28, 31].forEach((s, k) => this.bell(L, s, t + k * 0.16, 0.05)); break;
      case "offkey": {
        const o = this.osc("sawtooth", 330, t);
        [[0.4, 365], [0.8, 300], [1.2, 390], [1.7, 270], [2.3, 240]].forEach(([dt, f]) => o.frequency.linearRampToValueAtTime(f, t + dt));
        const vib = c.createOscillator(); vib.frequency.value = 7;
        const vg = c.createGain(); vg.gain.value = 14;
        vib.connect(vg); vg.connect(o.frequency);
        const lp = this.filter("lowpass", 1400);
        const e = this.env(t, 0.08, 2.1, 0.4, 0.07);
        o.connect(lp); lp.connect(e); e.connect(out);
        o.start(t); vib.start(t); o.stop(t + 2.8); vib.stop(t + 2.8);
        break;
      }
      case "wah":
        [[0, 293.7, 0.32], [0.38, 277.2, 0.32], [0.76, 261.6, 0.32], [1.14, 246.9, 1.1]].forEach(([dt, f, d], k) => {
          const s = t + dt, o = this.osc("sawtooth", f, s);
          const lp = this.filter("lowpass", 300, 6);
          lp.frequency.setValueAtTime(300, s); lp.frequency.linearRampToValueAtTime(1300, s + 0.12); lp.frequency.linearRampToValueAtTime(400, s + d);
          if (k === 3) {
            const v = c.createOscillator(); v.frequency.value = 6;
            const vg = c.createGain(); vg.gain.value = 6;
            v.connect(vg); vg.connect(o.frequency); v.start(s); v.stop(s + d + 0.3);
          }
          const e = this.env(s, 0.02, d - 0.05, 0.2, 0.06);
          o.connect(lp); lp.connect(e); e.connect(out); o.start(s); o.stop(s + d + 0.3);
        });
        break;
    }
  }
};

// Har mood ka apna music (D major pentatonic — Sa Re Ga Pa Dha)
const MOODS = {
  title: {
    bpm: 56,
    setup(M, L, t) { M.drone(L, [-12, -5], 0.045); M.boom(L, t + 0.2, 0.6); M.riser(L, t + 0.5, 4.2); },
    step(M, L, i, t) {
      if (i > 3 && i % 4 === 0) M.bell(L, pick([12, 14, 16, 19, 21, 24]), t, 0.045);
      if (i === 9) M.boom(L, t, 0.55);
      if (i > 9 && i % 16 === 9) M.boom(L, t, 0.3);
    }
  },
  funny: {
    bpm: 112,
    setup(M, L) { M.drone(L, [-12], 0.018); },
    step(M, L, i, t) {
      const s = i % 16;
      if (s % 8 === 0) M.pluck(L, -12, t, 0.2, 0.3);
      if (s % 8 === 4) M.pluck(L, -5, t, 0.18, 0.3);
      if (s === 0 || s === 10) M.drum(L, t, "dha", 0.7);
      if (s === 6 || s === 14) M.drum(L, t, "ta", 0.7);
      if (s % 2 === 1) M.drum(L, t, "tin", 0.8);
      const mel = [12, null, 16, 19, 16, null, 14, 12, 19, null, 21, 19, 16, 14, 12, null];
      const n = mel[s];
      if (n !== null && i >= 16) M.pluck(L, n, t, 0.085, 0.2);
    }
  },
  love: {
    bpm: 70,
    setup(M, L) { M.drone(L, [-12, -5], 0.02); },
    step(M, L, i, t) {
      const chords = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]]; // D, Bm, G, A
      const ch = chords[Math.floor(i / 8) % 4];
      if (i % 8 === 0) M.pad(L, ch, t, (8 * 60) / 70 / 2, 0.035);
      if (i % 2 === 0) M.pluck(L, ch[(i / 2) % 3] + 12, t, 0.035, 1.4);
      const mel = [16, null, 14, 12, 14, null, null, null, 12, null, 9, 7, 9, null, null, null,
                   16, 19, null, 16, 14, null, 12, null, 14, null, null, null, null, null, null, null];
      const n = mel[i % 32];
      if (n !== null && i >= 8) M.flute(L, n + 12, t, 0.75, 0.065);
    }
  },
  celebrate: {
    bpm: 128,
    setup(M, L, t) { M.boom(L, t, 0.45); },
    step(M, L, i, t) {
      const s = i % 16;
      if ([0, 6, 8].includes(s)) M.drum(L, t, "dha");
      if ([3, 11, 14].includes(s)) M.drum(L, t, "ghe", 0.8);
      if ([2, 4, 10, 12].includes(s)) M.drum(L, t, "ta", 0.8);
      M.drum(L, t, "tin", s % 2 ? 1 : 0.5);
      if (s === 0) M.pad(L, Math.floor(i / 16) % 2 ? [-7, -3, 0] : [0, 4, 7], t, 3.4, 0.03);
      const mel = [12, 14, 16, 19, 21, 19, 16, 14, 12, 16, 19, 24, 21, 19, 16, null];
      const n = mel[s];
      if (n !== null && i >= 16) M.pluck(L, n, t, 0.07, 0.25);
      if (s === 15 && Math.random() < 0.5) M.bell(L, pick([24, 26, 28, 31]), t, 0.04);
    }
  },
  calm: {
    bpm: 84,
    setup(M, L) { M.drone(L, [-12, -5], 0.025); },
    step(M, L, i, t) {
      const arp = [0, 7, 12, 16, 19, 16, 12, 7];
      M.pluck(L, arp[i % 8], t, 0.055, 0.9);
      if (i % 16 === 0) M.pad(L, i % 32 ? [-7, -3, 0] : [0, 4, 7], t, 5, 0.025);
      if (i % 8 === 4) M.drum(L, t, "tin", 0.6);
    }
  }
};

// ---------- Cinema: intro story + ending ----------
const cine = { mode: "intro", scenes: [], idx: 0, timers: [], line: 0, lines: [], typeTimer: null, lineDone: null };
const SCENE_MOOD = { title: "title", talk: "funny", checklist: "funny", hearts: "love", welcome: "celebrate", rules: "calm", go: "celebrate", report: "calm", wish: "celebrate" };
function hostName(i) { return (PARTY.HOSTS && PARTY.HOSTS[i]) || ""; }
function fillNames(s) {
  return String(s ?? "")
    .replace(/\{H1\}/g, hostName(0))
    .replace(/\{H2\}/g, hostName(1))
    .replace(/\{SONGS\}/g, state.game ? state.game.done : 0);
}
function later(ms, fn) { cine.timers.push(setTimeout(fn, REDUCED ? Math.min(ms, 400) : ms)); }
function cineClear() {
  cine.timers.forEach(clearTimeout);
  cine.timers = [];
  clearInterval(cine.typeTimer);
  cine.lineDone = null;
}

function openCine(mode, scenes) {
  stopAudio();
  cineClear();
  music.unlock();
  document.body.classList.add("cine-mode");
  $("#cineFade").classList.remove("on");
  cine.mode = mode;
  cine.scenes = scenes;
  cine.idx = 0;
  $("#cineDots").innerHTML = scenes.map(() => "<i></i>").join("");
  window.scrollTo(0, 0);
  renderCine();
}
function startIntro() { openCine("intro", PARTY.STORY); }
function startOutro() { openCine("outro", [{ type: "report" }, { type: "wish" }]); }
function closeCine() {
  cineClear();
  fx.auto = false;
  music.stop(1.8);
  setLanterns(0);
  $("#cine").classList.remove("letterbox");
  $("#cineFade").classList.remove("on");
  document.body.classList.remove("cine-mode");
  if (cine.mode === "intro") goToGameArea();
  else { state.game = null; showView("setup"); }
}
// Scene badalte waqt black fade (film jaisa cut)
function goScene(i) {
  cineClear();
  if (REDUCED) { cine.idx = i; return renderCine(); }
  const fade = $("#cineFade");
  music.sfx("whoosh");
  fade.classList.add("on");
  cine.timers.push(setTimeout(() => { cine.idx = i; renderCine(); fade.classList.remove("on"); }, 480));
}
function nextScene() {
  if (cine.idx >= cine.scenes.length - 1) return closeCine();
  goScene(cine.idx + 1);
}
// "Aage" button: chal rahi dialogue line ko poora karo / agli line / agla scene
function cineAdvance() {
  if (cine.lineDone) return cine.lineDone();
  nextScene();
}

// Aasmaan mein udti kandeel (sky lanterns)
function setLanterns(n) {
  const box = $("#lanterns");
  if (!n || REDUCED) { box.classList.remove("show"); return; }
  if (box.childElementCount !== n) {
    box.innerHTML = Array.from({ length: n }, () => {
      const s = (0.55 + Math.random() * 0.75).toFixed(2);
      return `<i class="lantern" style="left:${randInt(3, 95)}%;--s:${s};--dur:${randInt(14, 26)}s;--delay:-${randInt(0, 20)}s;--sway:${randInt(10, 40)}px"></i>`;
    }).join("");
  }
  box.classList.add("show");
}

function castHtml() {
  const faces = PARTY.FACES || ["🧑", "👩"];
  return `<div class="cast">${[0, 1].map((i) => `
    <div class="actor a${i + 1}" id="actor${i}">
      <div class="bubble-slot"><div class="bubble" id="bubble${i}"></div></div>
      <div class="face"><span id="face${i}">${faces[i]}</span></div>
      <div class="tag">${esc(hostName(i))}</div>
    </div>`).join("")}</div>`;
}
const HEART_SVG = `<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="heartGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#ff8a1f"/><stop offset="1" stop-color="#ff3d7f"/></linearGradient></defs><path fill="url(#heartGrad)" d="M12 21.2s-7.6-4.7-9.9-9.2C.4 8.6 2.4 4.6 6.3 4.6c2.3 0 3.9 1.3 5.7 3.4 1.8-2.1 3.4-3.4 5.7-3.4 3.9 0 5.9 4 4.2 7.4-2.3 4.5-9.9 9.2-9.9 9.2z"/></svg>`;

function renderCine() {
  cineClear();
  const sc = cine.scenes[cine.idx];
  if (!sc) return closeCine();
  const last = cine.idx === cine.scenes.length - 1;
  const stage = $("#cineStage");
  const mood = sc.mood || SCENE_MOOD[sc.type] || "calm";
  const cineEl = $("#cine");
  cineEl.dataset.mood = mood;
  cineEl.classList.toggle("letterbox", sc.type === "title" || sc.type === "hearts" || !!sc.letterbox);
  music.setMood(mood);
  music.duck(false);
  if (sc.sfx) later(300, () => music.sfx(sc.sfx));
  setLanterns(sc.lanterns || sc.type === "hearts" ? 14 : 0);
  fx.auto = sc.type === "wish";
  if (fx.auto) startFx();
  let html = "";

  switch (sc.type) {
    case "title":
      html = `<div class="scene title-card">
        ${sc.kicker ? `<p class="kicker">${esc(fillNames(sc.kicker))}</p>` : ""}
        <div class="moon-orb"></div>
        <h1 class="gold-text">${esc(fillNames(sc.title))}</h1>
        <div class="title-rule"></div>
        <p class="sub serif">${esc(fillNames(sc.sub))}</p>
        <div class="diya solo" style="--d:2.4s"><i class="flame"></i></div>
      </div>`;
      later(2500, () => music.sfx("sparkle"));   // diya jalte hi
      later(7000, nextScene);
      break;

    case "talk":
      html = `${sc.night ? `<div class="moon-orb corner"></div>` : ""}
        <div class="scene story${sc.shake ? " shake" : ""}">
        <div class="caption">${esc(fillNames(sc.caption))}</div>
        <div class="props">${esc(sc.props || "")}</div>
        ${castHtml()}</div>`;
      later(900, () => playLines(sc.lines || []));
      break;

    case "checklist": {
      const items = sc.items || [];
      html = `<div class="scene story">
        <div class="caption">${esc(fillNames(sc.caption))}</div>
        <ul class="checklist">${items.map((it, i) =>
          `<li class="${it[1] ? "ok" : "no"}" style="animation-delay:${0.5 + i * 0.6}s"><span class="box">${it[1] ? "✅" : "❌"}</span>${esc(fillNames(it[0]))}</li>`).join("")}</ul>
        ${castHtml()}</div>`;
      items.forEach((it, i) => later(500 + i * 600 + 150, () => music.sfx(it[1] ? "tick" : "buzz")));
      later(900 + items.length * 600, () => playLines(sc.lines || []));
      break;
    }

    case "hearts":
      html = `<div class="scene hearts">
        <div class="duo">
          <div class="diya l" style="--d:.4s"><i class="flame"></i></div>
          ${HEART_SVG}
          <div class="diya r" style="--d:.6s"><i class="flame"></i></div>
        </div>
        <h2 class="cine-quote gold-text">${esc(fillNames(sc.title))}</h2>
        <p class="sub serif">${esc(fillNames(sc.sub))}</p>
      </div>`;
      later(2900, () => music.sfx("heartbeat"));
      later(3100, () => {
        music.sfx("sparkle");
        const h = $(".hearts .heart");
        if (h) { const r = h.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 46); }
      });
      later(10000, nextScene);
      break;

    case "welcome":
      html = `<div class="scene welcome">
        <div class="hosts">
          <div class="actor a1"><div class="face"><span>🙏</span></div><div class="tag">${esc(hostName(0))}</div></div>
          <div class="mini-heart">❤️</div>
          <div class="actor a2"><div class="face"><span>🙏</span></div><div class="tag">${esc(hostName(1))}</div></div>
        </div>
        <h1 class="gold-text">${esc(fillNames(sc.title))}</h1>
        <p class="sub">${esc(fillNames(sc.sub))}</p>
        <div class="diya-row">${[0, 1, 2, 3, 4].map((i) => `<div class="diya" style="--d:${0.6 + i * 0.3}s"><i class="flame"></i></div>`).join("")}</div>
      </div>`;
      later(150, () => music.sfx("tada"));
      later(1350, () => celebrate(4));
      later(7000, nextScene);
      break;

    case "rules": {
      const items = sc.items || [];
      html = `<div class="scene"><p class="scene-title">${esc(fillNames(sc.title))}</p><ul class="rules">${items.map((r, i) =>
        `<li style="animation-delay:${0.3 + i * 1.1}s"><span class="e">${esc(r[0])}</span><span>${esc(fillNames(r[1]))}</span></li>`).join("")}</ul></div>`;
      items.forEach((r, i) => later(300 + i * 1100 + 100, () => music.sfx("pop")));
      later(3400 + items.length * 1100, nextScene);
      break;
    }

    case "go":
      html = `<div class="scene"><h1 class="gold-text">${esc(fillNames(sc.title))}</h1><p class="sub">${esc(fillNames(sc.sub))}</p>
        <button class="btn big go-btn" id="goBtn">🎶 Game shuru karo</button></div>`;
      later(100, () => music.sfx("tada"));
      later(1300, () => celebrate(5));
      break;

    case "report": {
      const o = PARTY.OUTRO || {};
      const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      html = `<div class="scene"><div class="report">
        <div class="report-head"><h2>📊 ${esc(fillNames(o.REPORT_TITLE || "Diwali Night Report"))}</h2><span>${esc(today)}</span></div>
        <div class="kpis">${(o.KPIS || []).map((k, i) =>
          `<div class="kpi" style="animation-delay:${0.4 + i * 0.5}s"><div class="k-e">${esc(k[0])}</div><div class="k-v" data-count="${esc(fillNames(k[2]))}">${esc(fillNames(k[2]))}</div><div class="k-l">${esc(fillNames(k[1]))}</div></div>`).join("")}</div>
        <p class="report-note" style="animation-delay:${0.6 + (o.KPIS || []).length * 0.5}s">${esc(fillNames(o.REPORT_NOTE || ""))}</p>
      </div></div>`;
      later(50, countUpKpis);
      later(8000, nextScene);
      break;
    }

    case "wish": {
      const o = PARTY.OUTRO || {};
      html = `<div class="scene wish">
        <div class="diya-row" style="margin:0 0 26px">${[0, 1, 2, 3, 4].map((i) => `<div class="diya" style="--d:${0.2 + i * 0.25}s"><i class="flame"></i></div>`).join("")}</div>
        <h1>${esc(fillNames(o.WISH || "Happy Diwali!"))}</h1>
        <p class="sub">${esc(fillNames(o.MESSAGE || ""))}</p>
        <div class="again"><button class="btn ghost" id="againBtn">🔁 Phir se khelo</button></div>
      </div>`;
      later(200, () => { celebrate(6); music.sfx("sparkle"); });
      break;
    }
  }

  stage.innerHTML = html;
  stage.scrollTop = 0;
  $$("#cineDots i").forEach((d, i) => d.classList.toggle("on", i === cine.idx));
  $("#cineNext").textContent = last ? (cine.mode === "intro" ? "Game pe chalo 🎶" : "Band karo") : "Aage ✨";
  $("#cineSkip").classList.toggle("hidden", last);
  const go = $("#goBtn");
  if (go) go.addEventListener("click", closeCine);
  const again = $("#againBtn");
  if (again) again.addEventListener("click", () => { closeCine(); startGame(); });
}

// Dialogue: ek-ek line, typewriter style, bolne wale ka chehra badalta hai
function playLines(lines) {
  cine.lines = lines;
  cine.line = 0;
  if (!lines.length) return later(1500, nextScene);
  music.duck(true);
  speak();
}
function speak() {
  const l = cine.lines[cine.line];
  if (!l) return;
  const who = l[0] === "H2" ? 1 : 0;
  const other = 1 - who;
  const text = fillNames(l[2]);
  const actor = $("#actor" + who), otherActor = $("#actor" + other);
  if (!actor) return;
  music.sfx(l[3] || "pop");
  actor.classList.add("talking"); actor.classList.remove("quiet");
  otherActor.classList.remove("talking"); otherActor.classList.add("quiet");
  $("#bubble" + other).classList.remove("show");
  $("#face" + who).innerHTML = `<span class="pop">${esc(l[1] || "")}</span>`;
  const bubble = $("#bubble" + who);
  bubble.textContent = "";
  bubble.classList.add("show");

  const next = () => {
    cine.lineDone = null;
    cine.timers.forEach(clearTimeout);
    cine.timers = [];
    cine.line++;
    if (cine.line < cine.lines.length) speak();
    else later(1400, nextScene);
  };
  const typed = () => {                       // line poori dikh gayi
    clearInterval(cine.typeTimer);
    bubble.textContent = text;
    actor.classList.remove("talking");
    cine.lineDone = next;                     // ab "Aage" = agli line
    later(1100 + text.length * 30, next);
  };
  cine.lineDone = typed;                      // typing ke beech "Aage" = line turant poori
  if (REDUCED) return typed();
  let i = 0;
  clearInterval(cine.typeTimer);
  cine.typeTimer = setInterval(() => {
    i++;
    bubble.textContent = text.slice(0, i);
    if (i >= text.length) typed();
  }, 32);
}

function countUpKpis() {
  $$(".kpi .k-v").forEach((el, idx) => {
    const raw = el.dataset.count;
    const n = parseInt(raw, 10);
    if (isNaN(n) || String(n) !== raw.trim()) return;
    el.textContent = "0";
    later(400 + idx * 500, () => {
      const t0 = performance.now(), dur = 900;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
}

// ---------- Splash: "Tap karke shuru karo" (isi click se music unlock hota hai) ----------
let splashGone = false;
function splashOpen() { return !$("#splash").classList.contains("hidden") && !splashGone; }
function splashStart() {
  if (splashGone) return;
  splashGone = true;
  music.unlock();
  const sp = $("#splash");
  sp.classList.add("leaving");
  setTimeout(() => sp.classList.add("hidden"), REDUCED ? 0 : 700);
  startIntro();
}
$("#splashBtn").addEventListener("click", splashStart);

const muteBtn = $("#muteBtn");
function paintMute() { muteBtn.textContent = music.on ? "🔊" : "🔇"; muteBtn.title = music.on ? "Music band karo" : "Music chalao"; }
if (PARTY.MUSIC === false) muteBtn.classList.add("hidden");
paintMute();
muteBtn.addEventListener("click", () => { music.unlock(); music.toggle(); paintMute(); });

$("#cineNext").addEventListener("click", () => {
  if (cine.idx === cine.scenes.length - 1) return closeCine();
  cineAdvance();
});
$("#cineSkip").addEventListener("click", closeCine);
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("cine-mode")) return;
  if (splashOpen()) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); splashStart(); }
    return;
  }
  if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (cine.idx === cine.scenes.length - 1) return closeCine();
    cineAdvance();
  }
  if (e.key === "Escape") closeCine();
});

// ---------- Init ----------
$("#appName").textContent = CONFIG.APP_NAME;
$("#splashTitle").textContent = CONFIG.APP_NAME;
if (location.protocol === "file:") {
  setTimeout(() => toast("⚠️ YouTube mode ke liye app ko GitHub Pages ya local server se kholo", 6000), 800);
}
(async function init() {
  await loadLocalTracks();
  renderSetup();
  showView("setup");
  if (PARTY.SHOW_INTRO) {
    $("#cine").dataset.mood = "title";
    $("#splash").classList.remove("hidden");
  } else document.body.classList.remove("cine-mode");
})();
