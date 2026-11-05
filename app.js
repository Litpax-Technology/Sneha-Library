// ===== Gaana Pehchano — App =====

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const COLORS = ["#ff4d8d", "#8b5cff", "#ffb020", "#22c58b", "#3aa0ff", "#ff6b3d", "#c04dff", "#16c7c7", "#e8457a", "#6f7cff"];

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage band hai, ignore */ } }
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

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- Songs (config + browser changes) ----------
function loadSongs() {
  const ov = store.get("gp_overrides", {});
  const custom = store.get("gp_custom", []);
  const base = SONGS.map((s, i) => ({ ...s, key: "b" + i, ...(ov["b" + i] || {}) }));
  const extra = custom.map((s, i) => ({ ...s, key: "c" + i, custom: true }));
  return [...base, ...extra].map((s) => ({ ...s, id: parseYtId(s.yt) }));
}
let songs = loadSongs();
const songStatus = {};      // key -> { ok: true|false|null, text }
const broken = new Set();   // video ids jo is session mein nahi chale

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

function playableSongs() {
  const lang = state.settings.lang;
  return songs.filter((s) => s.id && !broken.has(s.id) && (lang === "Mix" || s.lang === lang));
}

// ---------- State ----------
const state = {
  players: store.get("gp_players", []),
  settings: {
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

// ---------- Navigation ----------
function showView(v) {
  state.view = v;
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + v).classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", (t.dataset.nav === "songs") === (v === "songs")));
  if (v === "songs") renderSongTable();
  if (v === "setup") renderSetup();
}
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  if (t.dataset.nav === "songs") {
    if (state.game && ["playing", "loading"].includes(state.game.phase)) stopAudio();
    showView("songs");
  } else {
    if (!state.game) showView("setup");
    else if (state.game.finished) showView("result");
    else { showView("game"); renderGame(); }
  }
}));

// ---------- Setup screen ----------
function renderSetup() {
  $("#playerChips").innerHTML = state.players.map((n, i) =>
    `<span class="chip" style="background:${COLORS[i % COLORS.length]}">${esc(n)}<button data-rm="${i}" title="Hatao">✕</button></span>`
  ).join("") || `<span class="muted small">Abhi koi player nahi</span>`;

  setSeg("#clipSeg", state.settings.clip);
  setSeg("#langSeg", state.settings.lang);
  setSeg("#replaySeg", state.settings.replay);
  $("#roundsVal").textContent = state.settings.rounds;

  const all = songs.filter((s) => s.id);
  const pool = playableSongs();
  $("#songCountInfo").textContent =
    `${pool.length} gaane is setting mein ready hain (Hindi: ${all.filter((s) => s.lang === "Hindi").length}, Punjabi: ${all.filter((s) => s.lang === "Punjabi").length}). Aur add karne ho toh Songs tab.`;
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
  if (!playableSongs().length) return toast("Is language mein koi link wala gaana nahi. Songs tab mein link daalo.");
  if (!ytReady) toast("YouTube player load ho raha hai… internet on rakho");
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
    failCount: 0
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
    loading: `🎤 ${who} — gaana load ho raha hai…`,
    playing: `🎧 ${who}, dhyan se suno!`,
    played: `🤔 ${who}, batao kaunsa gaana tha?`,
    reveal: `${who} ka jawab sahi tha?`
  }[g.phase] || "";
  $("#turnLabel").innerHTML = label;

  if (g.phase === "loading") { $("#countdown").textContent = "…"; $("#progressBar").style.width = "0"; }
  if (g.phase === "played") { $("#countdown").textContent = "⏸"; }

  if (g.phase === "reveal" && g.song) {
    const s = g.song;
    $("#reveal").innerHTML = `
      <div class="song-title">🎶 ${esc(s.title)}</div>
      <div class="song-meta">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div>
      <span class="tag">${esc(s.lang)}</span>
      <div class="muted small" style="margin-top:8px">Clip ${fmtTime(s.startUsed)} se bajaya tha</div>`;
  }

  renderControls();
  renderScores();
}

function renderControls() {
  const g = state.game;
  const c = $("#controls");
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
             B("reveal", "👀 Answer dikhao", "yellow") +
             B("skip", "⏭ Doosra gaana", "ghost");
      break;
    case "reveal":
      html = B("correct", `✅ Sahi +${CONFIG.POINTS_CORRECT}`, "green") +
             B("wrong", "❌ Galat", "red") +
             B("more", "🔊 Aage suno", "ghost");
      break;
  }
  c.innerHTML = html;
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
    case "replay": if (g.replaysLeft > 0) { g.replaysLeft--; startClip(); } break;
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
  if (ok) { p.score += CONFIG.POINTS_CORRECT; p.correct++; toast(`🎉 Shabaash ${p.name}!`); }
  else toast(`😅 Agli baar ${p.name}!`);
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
    toast(`Round ${g.round} shuru!`);
  }
  g.current = null;
  g.phase = "spin";
  renderGame();
}

$("#endGameBtn").addEventListener("click", () => {
  if (confirm("Game abhi khatam karna hai?")) finishGame();
});

function finishGame() {
  const g = state.game;
  stopAudio();
  g.finished = true;
  const order = [...g.players].sort((a, b) => b.score - a.score);
  const top = order[0].score;
  const winners = order.filter((p) => p.score === top);
  $("#winnerTitle").textContent = top === 0
    ? "😅 Kisi ne nahi jeeta!"
    : winners.length > 1
      ? `🤝 Tie: ${winners.map((w) => w.name).join(" & ")}`
      : `🏆 ${winners[0].name} jeet gaya!`;
  $("#finalList").innerHTML = order.map((p, i) =>
    `<li><span>${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1 + "."} ${esc(p.name)}</span><span>${p.score}</span></li>`).join("");
  showView("result");
  confetti();
}
$("#playAgainBtn").addEventListener("click", startGame);
$("#backSetupBtn").addEventListener("click", () => { state.game = null; showView("setup"); });

function confetti() {
  const box = $("#confetti");
  box.innerHTML = "";
  for (let i = 0; i < 70; i++) {
    const el = document.createElement("i");
    el.style.left = Math.random() * 100 + "%";
    el.style.background = COLORS[i % COLORS.length];
    el.style.animationDuration = 2 + Math.random() * 2.5 + "s";
    el.style.animationDelay = Math.random() * 0.8 + "s";
    box.appendChild(el);
  }
}

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
    ctx.beginPath();
    ctx.moveTo(C, C);
    ctx.arc(C, C, R, a0, a0 + seg);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${n > 8 ? 20 : 26}px "Baloo 2", sans-serif`;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 4;
    const name = p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name;
    ctx.fillText(name, R - 18, 9);
    ctx.restore();
  }
  // outer ring + center
  ctx.beginPath(); ctx.arc(C, C, R, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 6; ctx.stroke();
  ctx.beginPath(); ctx.arc(C, C, 34, 0, 2 * Math.PI);
  ctx.fillStyle = "#160b2e"; ctx.fill();
  ctx.strokeStyle = "#ffc23d"; ctx.lineWidth = 5; ctx.stroke();
  ctx.font = "28px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("🎵", C, C + 2);
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
  const dur = 3800, t0 = performance.now();
  function frame(t) {
    const p = Math.min(1, (t - t0) / dur);
    const ease = 1 - Math.pow(1 - p, 4);
    wheelRot = from + (to - from) * ease;
    drawWheel();
    if (p < 1) requestAnimationFrame(frame);
    else {
      g.current = g.queue[w];
      g.phase = "ready";
      renderGame();
    }
  }
  requestAnimationFrame(frame);
}

// ---------- YouTube player ----------
let player = null;
let ytReady = false;
let pending = null;            // "game" | "test" | "check" | "more"
let loadTimer, stopTimer, tickTimer;
let checkResolve = null;
let testKey = null;

window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player("yt", {
    width: "200",
    height: "200",
    playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3, modestbranding: 1 },
    events: {
      onReady: () => { ytReady = true; try { player.setVolume(100); player.unMute(); } catch (e) {} },
      onStateChange: onPlayerState,
      onError: onPlayerError
    }
  });
};

function clearTimers() {
  clearTimeout(loadTimer);
  clearTimeout(stopTimer);
  clearInterval(tickTimer);
}
function stopAudio() {
  clearTimers();
  pending = null;
  try { if (player && ytReady) player.pauseVideo(); } catch (e) {}
}

function onPlayerState(e) {
  const S = YT.PlayerState;
  if (e.data === S.PLAYING) {
    if (pending === "game") {
      pending = null;
      clearTimeout(loadTimer);
      const g = state.game;
      g.phase = "playing";
      renderGame();
      runCountdown(state.settings.clip);
      stopTimer = setTimeout(endClip, state.settings.clip * 1000);
    } else if (pending === "test") {
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
  if (pending === "game" || (state.game && state.game.phase === "playing")) onSongFail(reason);
}

function onSongFail(reason) {
  const g = state.game;
  clearTimers();
  pending = null;
  if (g.song) {
    broken.add(g.song.id);
    songStatus[g.song.key] = { ok: false, text: "❌ " + reason };
  }
  g.failCount++;
  if (g.failCount >= 5) {
    g.phase = "ready";
    renderGame();
    return toast("Gaane load nahi ho rahe — internet ya Songs tab ke links check karo", 4000);
  }
  toast(`"${g.song ? g.song.title : "Gaana"}" nahi chala (${reason}) — doosra laga rahe hain`);
  playNewSong();
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
  const s = pool[Math.floor(Math.random() * pool.length)];
  const start = hasStart(s.start) ? +s.start : randInt(CONFIG.RANDOM_START_MIN, CONFIG.RANDOM_START_MAX);
  return { ...s, startUsed: start };
}

function playNewSong() {
  const g = state.game;
  const s = pickSong();
  if (!s) { g.phase = "ready"; renderGame(); return toast("Koi chalne wala gaana nahi bacha. Songs tab check karo."); }
  g.song = s;
  g.played.add(s.key);
  g.replaysLeft = state.settings.replay;
  startClip();
}

function startClip() {
  const g = state.game;
  if (!ytReady) { toast("YouTube player abhi ready nahi — 2 sec baad try karo"); g.phase = g.song ? "played" : "ready"; return renderGame(); }
  clearTimers();
  pending = "game";
  g.phase = "loading";
  renderGame();
  player.loadVideoById({ videoId: g.song.id, startSeconds: g.song.startUsed });
  loadTimer = setTimeout(() => { if (pending === "game") onSongFail("Load nahi hua"); }, CONFIG.LOAD_TIMEOUT_MS);
}

function endClip() {
  const g = state.game;
  clearTimers();
  pending = null;
  try { player.pauseVideo(); } catch (e) {}
  $("#progressBar").style.width = "100%";
  g.phase = "played";
  renderGame();
}

function runCountdown(sec) {
  let left = sec;
  const t0 = performance.now();
  $("#countdown").textContent = left;
  $("#progressBar").style.transition = "none";
  $("#progressBar").style.width = "0";
  requestAnimationFrame(() => {
    $("#progressBar").style.transition = `width ${sec}s linear`;
    $("#progressBar").style.width = "100%";
  });
  tickTimer = setInterval(() => {
    left = Math.max(0, sec - Math.floor((performance.now() - t0) / 1000));
    $("#countdown").textContent = left;
  }, 200);
}

function playMore() {
  const g = state.game;
  if (!ytReady || !g.song) return;
  clearTimers();
  pending = "more";
  player.loadVideoById({ videoId: g.song.id, startSeconds: g.song.startUsed });
  loadTimer = setTimeout(() => { pending = null; }, CONFIG.LOAD_TIMEOUT_MS);
}

// ---------- Songs screen ----------
function renderSongTable() {
  const rows = songs.map((s, i) => `
    <tr data-key="${s.key}">
      <td>${i + 1}</td>
      <td><div class="t">${esc(s.title)}</div><div class="s">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div></td>
      <td><span class="lang-tag ${esc(s.lang)}">${esc(s.lang)}</span></td>
      <td><input class="link" type="text" value="${esc(s.yt || "")}" placeholder="YouTube link paste karo"></td>
      <td><input class="start" type="number" min="0" value="${hasStart(s.start) ? +s.start : ""}" placeholder="auto"></td>
      <td><span class="status">${statusText(s)}</span></td>
      <td><div class="acts">
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(s.title + " " + s.singer + " official video")}" target="_blank" rel="noopener" title="YouTube pe dhundho">🔍</a>
        <button data-test="${s.key}" title="5 sec suno">▶</button>
        ${s.custom ? `<button data-del="${s.key}" title="Hatao">🗑</button>` : ""}
      </div></td>
    </tr>`).join("");
  $("#songTable tbody").innerHTML = rows;
  const withLink = songs.filter((s) => s.id).length;
  $("#songsSummary").textContent = `(${withLink}/${songs.length} mein link hai)`;
}
function statusText(s) {
  if (!s.id) return s.yt ? "⚠️ Link samajh nahi aaya" : "⚪ Link nahi";
  if (songStatus[s.key]) return esc(songStatus[s.key].text);
  return broken.has(s.id) ? "❌ Nahi chala" : "— check nahi kiya";
}
function renderStatusCell(key) {
  const s = songs.find((x) => x.key === key);
  const row = document.querySelector(`#songTable tr[data-key="${key}"] .status`);
  if (s && row) row.innerHTML = statusText(s);
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
    clearTimers();
    pending = "test";
    testKey = s.key;
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
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
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
  if (!confirm("Is browser mein kiye saare song changes (links + naye gaane) hata dein? config.js wali list wapas aa jayegi.")) return;
  store.set("gp_overrides", {});
  store.set("gp_custom", []);
  songs = loadSongs();
  Object.keys(songStatus).forEach((k) => delete songStatus[k]);
  broken.clear();
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
  custom.push({
    title,
    singer: $("#newSinger").value.trim(),
    movie: $("#newMovie").value.trim(),
    lang: $("#newLang").value,
    yt: link,
    start: startV === "" ? null : Math.max(0, +startV)
  });
  store.set("gp_custom", custom);
  songs = loadSongs();
  ["#newTitle", "#newSinger", "#newMovie", "#newLink", "#newStart"].forEach((s) => ($(s).value = ""));
  renderSongTable();
  toast(`➕ "${title}" add ho gaya`);
});

// ---------- Init ----------
$("#appName").textContent = CONFIG.APP_NAME;
document.title = CONFIG.APP_NAME;
if (location.protocol === "file:") {
  setTimeout(() => toast("⚠️ File seedha khologe toh YouTube nahi chalega — GitHub Pages ya local server se kholo", 6000), 800);
}
renderSetup();
