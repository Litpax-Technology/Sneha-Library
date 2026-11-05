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
  players: store.get("gp_players", []),
  settings: {
    source: CONFIG.DEFAULT_SOURCE || "local",
    clip: CONFIG.DEFAULT_CLIP,
    lang: "Mix",
    rounds: CONFIG.DEFAULT_ROUNDS,
    replay: CONFIG.REPLAY_LIMIT,
    ...store.get("gp_settings", {})
  },
  game: null,
  view: "setup"
};
function saveSettings() { store.set("gp_settings", state.settings); }

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
  $$(".tab").forEach((t) => t.classList.toggle("active", (t.dataset.nav === "songs") === (v === "songs") && t.dataset.nav !== "intro"));
  if (v === "songs") { renderSongTable(); renderLocalTable(); }
  if (v === "setup") renderSetup();
  window.scrollTo(0, 0);
}
function goToGameArea() {
  if (!state.game) showView("setup");
  else if (state.game.finished) showView("result");
  else { showView("game"); renderGame(); }
}
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  const nav = t.dataset.nav;
  if (nav === "intro") { stopAudio(); return startIntro(); }
  if (nav === "songs") {
    if (state.game && ["playing", "loading"].includes(state.game.phase)) { stopAudio(); state.game.phase = "played"; }
    return showView("songs");
  }
  goToGameArea();
}));

// ---------- Setup screen ----------
function renderSetup() {
  $("#playerChips").innerHTML = state.players.map((n, i) =>
    `<span class="chip" style="background:${COLORS[i % COLORS.length]}">${esc(n)}<button data-rm="${i}" aria-label="${esc(n)} ko hatao">✕</button></span>`
  ).join("") || `<span class="muted small">Abhi koi player nahi — naam likh ke Add dabao</span>`;

  setSeg("#sourceSeg", state.settings.source);
  setSeg("#clipSeg", state.settings.clip);
  setSeg("#langSeg", state.settings.lang);
  setSeg("#replaySeg", state.settings.replay);
  $("#roundsVal").textContent = state.settings.rounds;

  const pool = playableSongs();
  let info;
  if (state.settings.source === "local") {
    const h = localTracks.filter((t) => t.lang === "Hindi").length;
    const p = localTracks.filter((t) => t.lang === "Punjabi").length;
    info = localTracks.length
      ? `📁 ${pool.length} instrumental files is setting mein ready (Hindi ${h}, Punjabi ${p}). Bina ads, bina internet.`
      : `📁 Abhi koi file nahi. Songs tab mein instrumental mp3 files daalo, ya YouTube chuno.`;
  } else {
    const all = songs.filter((s) => s.id);
    info = `▶ ${pool.length} YouTube gaane ready (Hindi ${all.filter((s) => s.lang === "Hindi").length}, Punjabi ${all.filter((s) => s.lang === "Punjabi").length}). Ad aaya toh awaaz mute karke wait karega.`;
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
bindSeg("#clipSeg", "clip", true);
bindSeg("#langSeg", "lang", false);
bindSeg("#replaySeg", "replay", true);
$("#roundsMinus").addEventListener("click", () => { state.settings.rounds = Math.max(1, state.settings.rounds - 1); saveSettings(); renderSetup(); });
$("#roundsPlus").addEventListener("click", () => { state.settings.rounds = Math.min(30, state.settings.rounds + 1); saveSettings(); renderSetup(); });

function addPlayer() {
  const inp = $("#playerInput");
  const name = inp.value.trim();
  if (!name) return;
  if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) return toast("Ye naam pehle se hai");
  if (state.players.length >= 12) return toast("Max 12 players");
  state.players.push(name);
  store.set("gp_players", state.players);
  inp.value = "";
  inp.focus();
  renderSetup();
}
$("#addPlayerBtn").addEventListener("click", addPlayer);
$("#playerInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addPlayer(); });
$("#playerChips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rm]");
  if (!b) return;
  state.players.splice(+b.dataset.rm, 1);
  store.set("gp_players", state.players);
  renderSetup();
});
$("#startBtn").addEventListener("click", startGame);

// ---------- Game ----------
function startGame() {
  if (state.players.length < 2) return toast("Kam se kam 2 players chahiye");
  if (!playableSongs().length) {
    return toast(state.settings.source === "local"
      ? "Is language ki koi file nahi — Songs tab mein instrumental files daalo"
      : "Is language mein koi link wala gaana nahi — Songs tab mein link daalo", 3500);
  }
  if (state.settings.source === "youtube" && !ytReady) toast("YouTube player load ho raha hai… internet on rakho");
  state.game = {
    players: state.players.map((n, i) => ({ name: n, score: 0, correct: 0, color: COLORS[i % COLORS.length] })),
    round: 1,
    queue: state.players.map((_, i) => i),
    current: null,
    song: null,
    played: new Set(),
    replaysLeft: 0,
    phase: "spin",
    finished: false,
    failCount: 0,
    adWait: false
  };
  wheelRot = 0;
  showView("game");
  renderGame();
}

function renderGame() {
  const g = state.game;
  if (!g) return;
  $("#roundLabel").textContent = `Round ${g.round} / ${state.settings.rounds}`;

  const showWheel = ["spin", "spinning", "ready"].includes(g.phase);
  $("#wheelWrap").classList.toggle("hidden", !showWheel);
  $("#playerZone").classList.toggle("hidden", !["loading", "playing", "played"].includes(g.phase));
  $("#reveal").classList.toggle("hidden", g.phase !== "reveal");
  $("#eq").classList.toggle("on", g.phase === "playing");
  if (showWheel) drawWheel();

  const cur = g.current !== null ? g.players[g.current] : null;
  const who = cur ? `<span class="who">${esc(cur.name)}</span>` : "";
  const label = {
    spin: "🎡 Wheel ghumao — dekhte hain kiski baari!",
    spinning: "Ghoom raha hai…",
    ready: `🎤 Baari: ${who}`,
    loading: `🎤 ${who} — gaana load ho raha hai…` + (g.adWait ? `<span class="ad">📺 YouTube ad chal raha hai, awaaz band hai — bas khatam hone wala hai…</span>` : ""),
    playing: `🎧 ${who}, dhyan se suno!`,
    played: `🤔 ${who}, batao kaunsa gaana tha?`,
    reveal: `${who} ka jawab sahi tha?`
  }[g.phase] || "";
  $("#turnLabel").innerHTML = label;

  if (g.phase === "loading") { $("#countdown").textContent = g.adWait ? "📺" : "…"; $("#progressBar").style.width = "0"; }
  if (g.phase === "played") { $("#countdown").textContent = "⏸"; }

  if (g.phase === "reveal" && g.song) {
    const s = g.song;
    $("#reveal").innerHTML = `
      <div class="song-title">🎶 ${esc(s.title)}</div>
      <div class="song-meta">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div>
      <span class="tag">${esc(s.lang)}</span>
      ${hasStart(s.startUsed) ? `<div class="muted small" style="margin-top:8px">Clip ${fmtTime(s.startUsed)} se bajaya tha</div>` : ""}`;
  }
  renderControls();
  renderScores();
}

function renderControls() {
  const g = state.game;
  const B = (id, text, cls = "", dis = false) => `<button class="btn ${cls}" data-act="${id}" ${dis ? "disabled" : ""}>${text}</button>`;
  let html = "";
  switch (g.phase) {
    case "spin": html = B("spin", "🎡 Spin karo"); break;
    case "spinning": html = B("spin", "🎡 Ghoom raha hai…", "", true); break;
    case "ready": html = B("play", "▶️ Gaana bajao"); break;
    case "loading": html = B("skip", "⏭ Doosra gaana", "ghost"); break;
    case "playing": html = B("stop", "⏹ Rok do", "ghost"); break;
    case "played":
      html = B("replay", `🔁 Dobara (${g.replaysLeft})`, "ghost", g.replaysLeft <= 0) +
             B("reveal", "👀 Answer dikhao") +
             B("skip", "⏭ Doosra gaana", "ghost");
      break;
    case "reveal":
      html = B("correct", `✅ Sahi +${CONFIG.POINTS_CORRECT}`, "green") +
             B("wrong", "❌ Galat", "red") +
             B("more", "🔊 Aage suno", "ghost");
      break;
  }
  $("#controls").innerHTML = html;
}

$("#controls").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const g = state.game;
  switch (b.dataset.act) {
    case "spin": spin(); break;
    case "play": g.failCount = 0; playNewSong(); break;
    case "skip": stopAudio(); g.failCount = 0; playNewSong(); break;
    case "stop": endClip(); break;
    case "replay": if (g.replaysLeft > 0) { g.replaysLeft--; startClip(true); } break;
    case "reveal": stopAudio(); g.phase = "reveal"; renderGame(); break;
    case "more": playMore(); break;
    case "correct": markAnswer(true); break;
    case "wrong": markAnswer(false); break;
  }
});

function renderScores() {
  const g = state.game;
  const order = g.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.score - a.score);
  $("#scoreList").innerHTML = order.map((p) => {
    const done = !g.queue.includes(p.i);
    return `<li class="${p.i === g.current && g.phase !== "spin" ? "current" : ""}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="name">${esc(p.name)}</span>
      ${done ? `<span class="done">✓ khel liya</span>` : ""}
      <span class="pts">${p.score}</span></li>`;
  }).join("");
}

function markAnswer(ok) {
  const g = state.game;
  stopAudio();
  const p = g.players[g.current];
  if (ok) {
    p.score += CONFIG.POINTS_CORRECT;
    p.correct++;
    toast(`🎉 Shabaash ${p.name}!`);
    const r = $("#reveal").getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + 20, 90);
  } else {
    toast(`💃 ${p.name}, rule yaad hai na? 10 second naach ke dikhao!`, 3500);
  }
  nextTurn();
}

function nextTurn() {
  const g = state.game;
  g.queue = g.queue.filter((i) => i !== g.current);
  g.song = null;
  if (!g.queue.length) {
    g.round++;
    if (g.round > state.settings.rounds) return finishGame();
    g.queue = g.players.map((_, i) => i);
    toast(`🪔 Round ${g.round} shuru!`);
  }
  g.current = null;
  g.phase = "spin";
  renderGame();
}

$("#endGameBtn").addEventListener("click", () => { if (confirm("Game abhi khatam karna hai?")) finishGame(); });

function finishGame() {
  const g = state.game;
  stopAudio();
  g.finished = true;
  const order = [...g.players].sort((a, b) => b.score - a.score);
  const top = order[0].score;
  const low = order[order.length - 1].score;
  const winners = order.filter((p) => p.score === top);
  const losers = order.filter((p) => p.score === low);
  $("#winnerTitle").textContent = top === 0
    ? "😅 Kisi ne ek bhi nahi pehchana!"
    : winners.length > 1 ? `🤝 Tie: ${winners.map((w) => w.name).join(" & ")}` : `🏆 ${winners[0].name} jeet gaya!`;
  $("#loserLine").textContent = top !== low
    ? `🧨 Aur rule ke hisaab se… ${losers.map((l) => l.name).join(" & ")} patakhon ka kachra uthayenge!`
    : "";
  $("#finalList").innerHTML = order.map((p, i) =>
    `<li><span>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1 + "."} ${esc(p.name)}</span><span>${p.score}</span></li>`).join("");
  showView("result");
  celebrate(6);
}
$("#playAgainBtn").addEventListener("click", startGame);
$("#backSetupBtn").addEventListener("click", () => { state.game = null; showView("setup"); });

// ---------- Wheel ----------
let wheelRot = 0;
function drawWheel() {
  const g = state.game;
  const c = $("#wheel");
  const ctx = c.getContext("2d");
  const W = c.width, C = W / 2, R = C - 8;
  ctx.clearRect(0, 0, W, W);
  const idx = g.queue;
  const n = idx.length;
  if (!n) return;
  const seg = (2 * Math.PI) / n;

  for (let k = 0; k < n; k++) {
    const p = g.players[idx[k]];
    const a0 = wheelRot + k * seg;
    ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R, a0, a0 + seg); ctx.closePath();
    ctx.fillStyle = p.color; ctx.fill();
    ctx.strokeStyle = "rgba(255,214,150,0.55)"; ctx.lineWidth = 2; ctx.stroke();

    ctx.save();
    ctx.translate(C, C);
    const mid = (((a0 + seg / 2) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const flip = mid > Math.PI / 2 && mid < Math.PI * 1.5;
    ctx.rotate(a0 + seg / 2 + (flip ? Math.PI : 0));
    ctx.textAlign = flip ? "left" : "right";
    ctx.fillStyle = "#fff";
    ctx.font = `700 ${n > 8 ? 20 : 25}px "Mukta", sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 4;
    const name = p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name;
    ctx.fillText(name, flip ? -(R - 18) : R - 18, 9);
    ctx.restore();
  }
  for (let r = R * 0.34; r < R - 4; r += 5) {          // grooves
    ctx.beginPath(); ctx.arc(C, C, r, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(0,0,0,0.09)"; ctx.lineWidth = 1; ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(0, 0, W, W);  // fixed light
  sheen.addColorStop(0, "rgba(255,255,255,0.22)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0)");
  sheen.addColorStop(0.55, "rgba(0,0,0,0)");
  sheen.addColorStop(1, "rgba(0,0,0,0.30)");
  ctx.beginPath(); ctx.arc(C, C, R, 0, 2 * Math.PI); ctx.fillStyle = sheen; ctx.fill();
  ctx.beginPath(); ctx.arc(C, C, R, 0, 2 * Math.PI); ctx.strokeStyle = "#12061a"; ctx.lineWidth = 8; ctx.stroke();

  // center: diya label
  const LR = R * 0.27;
  ctx.beginPath(); ctx.arc(C, C, LR, 0, 2 * Math.PI); ctx.fillStyle = "#fff3dc"; ctx.fill();
  ctx.beginPath(); ctx.arc(C, C, LR - 7, 0, 2 * Math.PI); ctx.strokeStyle = "#ffc24b"; ctx.lineWidth = 3; ctx.stroke();
  ctx.save();
  ctx.translate(C, C);
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowBlur = 0;
  ctx.font = `${Math.round(LR * 0.7)}px sans-serif`;
  ctx.fillText("🪔", 0, -LR * 0.16);
  ctx.fillStyle = "#ff3d7f";
  ctx.font = `${Math.round(LR * 0.24)}px "Yatra One", sans-serif`;
  ctx.fillText("Gaana Pehchano", 0, LR * 0.52);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

function spin() {
  const g = state.game;
  if (g.phase !== "spin") return;
  g.phase = "spinning";
  renderGame();
  const n = g.queue.length;
  const seg = (2 * Math.PI) / n;
  const w = Math.floor(Math.random() * n);
  const jitter = (Math.random() - 0.5) * seg * 0.6;
  const target = -Math.PI / 2 - (w + 0.5) * seg + jitter;
  const TWO = 2 * Math.PI;
  const from = ((wheelRot % TWO) + TWO) % TWO;
  let to = target;
  while (to < from + TWO * 5) to += TWO;
  const dur = REDUCED ? 300 : 3800, t0 = performance.now();
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    wheelRot = from + (to - from) * (1 - Math.pow(1 - p, 4));
    drawWheel();
    if (p < 1) requestAnimationFrame(frame);
    else {
      g.current = g.queue[w];
      g.phase = "ready";
      renderGame();
      const r = $("#wheelWrap").getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + 10, 40);
    }
  }
  requestAnimationFrame(frame);
}

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

// ---------- Welcome intro ----------
let introIdx = 0;
let introTimers = [];
const HOST_FACES = ["🙋🏻‍♂️", "🙋🏻‍♀️"];
function hostName(i) { return (PARTY.HOSTS && PARTY.HOSTS[i]) || ""; }
function fillNames(s) { return String(s).replace(/\{H1\}/g, hostName(0)).replace(/\{H2\}/g, hostName(1)); }

function startIntro() {
  document.body.classList.add("intro-mode");
  introIdx = 0;
  fx.auto = true;
  startFx();
  $("#introDots").innerHTML = PARTY.SCENES.map(() => "<i></i>").join("");
  renderScene();
}
function endIntro() {
  introTimers.forEach(clearTimeout);
  introTimers = [];
  fx.auto = false;
  document.body.classList.remove("intro-mode");
  goToGameArea();
}
function nextScene() {
  if (introIdx >= PARTY.SCENES.length - 1) return endIntro();
  introIdx++;
  renderScene();
}
function renderScene() {
  introTimers.forEach(clearTimeout);
  introTimers = [];
  const sc = PARTY.SCENES[introIdx];
  const last = introIdx === PARTY.SCENES.length - 1;
  let html = "";
  let dur = 5000;

  if (sc.type === "diya") {
    html = `<div class="diya-row">${[0, 1, 2, 3, 4].map((i) => `<div class="diya" style="--d:${0.3 + i * 0.35}s"><i class="flame"></i></div>`).join("")}</div>
      <h1>${esc(fillNames(sc.title))}</h1><p class="sub">${esc(fillNames(sc.sub || ""))}</p>`;
    dur = 5000;
  } else if (sc.type === "hosts") {
    html = `<div class="hosts">${[0, 1].map((i) => `<div class="host"><div class="face"><span>${HOST_FACES[i]}</span></div></div>`).join("")}</div>
      <h1>${esc(fillNames(sc.title))}</h1><p class="sub">${esc(fillNames(sc.sub || ""))}</p>`;
    dur = 5500;
    introTimers.push(setTimeout(() => celebrate(3), 600));
  } else if (sc.type === "chat") {
    const lines = sc.lines || [];
    html = `<p class="scene-title">Hosts ki secret baatein 🤫</p><div class="chat">${lines.map((l, i) => {
      const who = l[0] === "H2" ? 1 : 0;
      return `<div class="bubble h${who + 1}" style="animation-delay:${0.4 + i * 1.5}s"><b>${esc(hostName(who))}</b>${esc(fillNames(l[1]))}</div>`;
    }).join("")}</div>`;
    dur = 2800 + lines.length * 1500;
  } else if (sc.type === "rules") {
    const items = sc.items || [];
    html = `<p class="scene-title">${esc(fillNames(sc.title || ""))}</p><ul class="rules">${items.map((r, i) =>
      `<li style="animation-delay:${0.3 + i * 1.1}s"><span class="e">${esc(r[0])}</span><span>${esc(fillNames(r[1]))}</span></li>`).join("")}</ul>`;
    dur = 3200 + items.length * 1100;
  } else if (sc.type === "go") {
    html = `<h1>${esc(fillNames(sc.title))}</h1><p class="sub">${esc(fillNames(sc.sub || ""))}</p>
      <button class="btn big go-btn" id="goBtn">🎮 Game pe chalo</button>`;
    dur = 0;
    introTimers.push(setTimeout(() => celebrate(5), 300));
  }

  $("#introStage").innerHTML = `<div class="scene">${html}</div>`;
  $$("#introDots i").forEach((d, i) => d.classList.toggle("on", i === introIdx));
  $("#introNext").textContent = last ? "Game pe chalo 🎮" : "Aage ✨";
  $("#introSkip").classList.toggle("hidden", last);
  const go = $("#goBtn");
  if (go) go.addEventListener("click", endIntro);
  if (dur && !REDUCED) introTimers.push(setTimeout(nextScene, dur));
}
$("#introNext").addEventListener("click", nextScene);
$("#introSkip").addEventListener("click", endIntro);
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("intro-mode")) return;
  if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nextScene(); }
  if (e.key === "Escape") endIntro();
});

// ---------- Init ----------
$("#appName").textContent = CONFIG.APP_NAME;
if (location.protocol === "file:") {
  setTimeout(() => toast("⚠️ File seedha khologe toh YouTube nahi chalega — GitHub Pages ya local server se kholo", 6000), 800);
}
(async function init() {
  await loadLocalTracks();
  renderSetup();
  showView("setup");
  if (PARTY.SHOW_INTRO) startIntro();
  else document.body.classList.remove("intro-mode");
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (state.game && state.view === "game") drawWheel(); });
  }
})();
