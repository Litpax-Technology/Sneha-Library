// ===== Ringtune Pehchano — Diwali Night =====

// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage band */ } }
};
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function hasStart(v) { return v !== null && v !== undefined && v !== "" && !isNaN(+v); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- Gaano ki files (IndexedDB, sirf is browser mein) ----------
const idb = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      if (this.db) return res(this.db);
      const r = indexedDB.open("ringtune_pehchano", 1);
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
const broken = new Set();     // jo files is session mein nahi chali

async function loadLocalTracks() {
  try { localTracks = (await idb.all("meta")) || []; } catch (e) { localTracks = []; }
  localTracks.sort((a, b) => a.added - b.added);
}
function trackById(id) { return localTracks.find((x) => x.id === id); }
// Site ke naam / faltu shabd hatao: "(RiskyJatt.Com)", "Official Music Video", "320 Kbps" waghera
const JUNK_SITES = /\b(?:www\.)?(?:riskyjatt|mr-?jatt|djpunjab|pagalworld|pagal-?world|djjohal|jattjugaad|pendujatt|songspk|mp3mad|wapking|djmaza|mr-?punjab|djyoungster|mp3tau|pagalfree|pagalnew|raag)\b(?:\.[a-z]{2,6})?/gi;
function cleanName(str) {
  return String(str || "")
    .replace(/\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i, "")
    .replace(/_/g, " ")
    .replace(/[\[(][^\])]*[\])]/g, " ")
    .replace(/\b(?:www\.)?[\w-]+\.(?:com|in|net|org|co|cc|io|me|info|xyz|fm|pk|live|site|online|club|biz)\b/gi, " ")
    .replace(JUNK_SITES, " ")
    .replace(/\b(official\s*(music\s*)?(video|audio|song)?|music\s*video|full\s*(video|song|audio)|lyrical|lyrics?|video\s*song|audio\s*song|hd|4k|\d{3}\s*kbps|mp3|download|instrumental|karaoke|ringtone)\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–|:,.]+|[\s\-–|:,.]+$/g, "")
    .trim();
}
function parseFileName(name) {
  const raw = String(name || "").replace(/\.[a-z0-9]{2,5}$/i, "");
  // "Gaana (Official Video) G.O.A.T" → bracket ke baad wala hissa = album/movie
  let tail = "";
  const m = raw.match(/^(.*?)\s*[\[(][^\])]*[\])]\s*(.+)$/);
  if (m && cleanName(m[2]) && cleanName(m[2]).length <= 30) tail = cleanName(m[2]);
  const base = cleanName(tail ? m[1] : raw);
  const parts = base.split(/\s+[-–|]\s+/).map(cleanName).filter(Boolean);
  let title = parts[0] || base, singer = parts[1] || "", movie = parts[2] || tail;
  // "Diljit Dosanjh Born To Shine" → singer + gaana alag (jaane-pehchane singer ho toh)
  if (!singer) {
    const known = (CONFIG.PUNJABI_SINGERS || []).concat(CONFIG.OTHER_SINGERS || []);
    const hit = known.find((k) => normTxt(title).startsWith(normTxt(k)) && normTxt(title).length > normTxt(k).length + 2);
    if (hit) {
      const words = hit.split(/\s+/).length;
      singer = hit;
      title = title.split(/\s+/).slice(words).join(" ");
    }
  }
  return { title, singer, movie };
}
const normTxt = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// mp3 ke andar save naam/singer/album padho (ID3 tags)
function decodeId3Text(b) {
  if (!b || !b.length) return "";
  const enc = b[0], data = b.subarray(1);
  let txt = "";
  try {
    if (enc === 0) txt = new TextDecoder("windows-1252").decode(data);
    else if (enc === 1) {
      const be = data[0] === 0xfe && data[1] === 0xff;
      txt = new TextDecoder(be ? "utf-16be" : "utf-16le").decode(data.subarray(data[0] === 0xff || be ? 2 : 0));
    } else if (enc === 2) txt = new TextDecoder("utf-16be").decode(data);
    else txt = new TextDecoder("utf-8").decode(data);
  } catch (e) { return ""; }
  return txt.replace(/\u0000+$/, "").replace(/﻿/g, "").replace(/\u0000/g, ", ").trim();
}
async function readTags(file) {
  const out = {};
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {      // "ID3"
      const ver = head[3], flags = head[5];
      const ss = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
      const size = ss(head, 6);
      const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 4 * 1024 * 1024)).arrayBuffer());
      const want = ver === 2 ? { TT2: "title", TP1: "artist", TP2: "artist2", TAL: "album", TCO: "genre" } : { TIT2: "title", TPE1: "artist", TPE2: "artist2", TALB: "album", TCON: "genre" };
      let p = 0;
      if (ver >= 3 && flags & 0x40) p = ver === 4 ? ss(buf, 0) : (((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0) + 4;
      const hl = ver === 2 ? 6 : 10, il = ver === 2 ? 3 : 4;
      while (p + hl <= buf.length) {
        const id = String.fromCharCode(...buf.subarray(p, p + il));
        if (!/^[A-Z0-9]+$/.test(id)) break;
        const fs = ver === 2 ? (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]
          : ver === 4 ? ss(buf, p + 4) : (((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0);
        if (fs <= 0 || p + hl + fs > buf.length) break;
        if (want[id] && !out[want[id]]) out[want[id]] = decodeId3Text(buf.subarray(p + hl, p + hl + fs));
        p += hl + fs;
      }
    }
    if (!out.title && file.size > 128) {                                  // purana ID3v1
      const t = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
      if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
        const dec = (a, b) => new TextDecoder("windows-1252").decode(t.subarray(a, b)).replace(/\u0000.*$/, "").trim();
        out.title = dec(3, 33); out.artist = out.artist || dec(33, 63); out.album = out.album || dec(63, 93);
      }
    }
  } catch (e) { /* tags na mile toh file ke naam se kaam chalega */ }
  return out;
}
function guessLang(singer, title, genre) {
  if (/punjabi/i.test(genre || "")) return "Punjabi";
  if (/hindi|bollywood|filmi/i.test(genre || "")) return "Hindi";
  const list = (CONFIG.PUNJABI_SINGERS || []).map(normTxt).filter(Boolean);
  const hay = normTxt(singer + " " + title);
  return list.some((n) => hay.includes(n)) ? "Punjabi" : "Hindi";
}
// File ka naam + andar ke tags milake best naam / singer / movie
async function smartInfo(file) {
  const p = parseFileName(file.name || "");
  const tg = await readTags(file);
  const singer = cleanName(tg.artist || tg.artist2 || "").replace(/\s*[\/;]\s*/g, ", ") || p.singer;
  let title = cleanName(tg.title) || p.title;
  // "Diljit Dosanjh Born To Shine" → "Born To Shine"
  const firstArtist = singer.split(/,|&|\bx\b|\bft\.?|\bfeat\.?/i)[0].trim();
  if (firstArtist && normTxt(title).startsWith(normTxt(firstArtist)) && normTxt(title) !== normTxt(firstArtist)) {
    title = title.slice(title.toLowerCase().indexOf(firstArtist.toLowerCase()) + firstArtist.length).replace(/^[\s\-–|:,]+/, "").trim() || title;
  }
  let movie = cleanName(tg.album) || p.movie;
  if (normTxt(movie) === normTxt(title) || /single/i.test(movie)) movie = "";
  return { title: title || "Bina naam", singer, movie, genre: tg.genre || "" };
}

// UVR ki Instrumental / Vocals files ki ab zaroorat nahi — galti se aa jaayein toh chhod do
const SKIP_RX = /(instrumental|karaoke|no[\s_-]*vocals?|\(vocals?\)|_vocals?\b|acapella|acappella)/i;

async function addFiles(fileList) {
  const all = [...fileList].filter((f) => (f.type || "").startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(f.name));
  if (!all.length) return toast("Isme koi audio file nahi mili");
  const files = all.filter((f) => !SKIP_RX.test(f.name));
  const skipped = all.length - files.length;
  const langPick = $("#uploadLang").value;
  let added = 0;
  try {
    for (const f of files) {
      const p = await smartInfo(f);
      const lang = langPick === "auto" ? guessLang(p.singer, f.name, p.genre) : langPick;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const meta = { id, added: Date.now() + added, file: f.name, title: p.title, singer: p.singer, movie: p.movie, lang, start: null };
      await idb.put("blobs", { id, blob: f });
      await idb.put("meta", meta);
      added++;
    }
  } catch (e) {
    toast("Browser mein jagah kam pad gayi — kuch files add nahi hui", 4000);
  }
  await loadLocalTracks();
  renderLocalTable();
  renderSetup();
  const msg = [];
  if (added) msg.push(`🎵 ${added} gaane add ho gaye`);
  if (skipped) msg.push(`${skipped} Instrumental/Vocals files chhod di`);
  if (msg.length) toast(msg.join(" · "), 3500);
}
async function updateTrack(id, patch) {
  const t = trackById(id);
  if (!t) return;
  Object.assign(t, patch);
  try { await idb.put("meta", t); } catch (e) { toast("Save nahi hua"); }
}
async function getLocalUrl(fid) {
  if (String(fid).startsWith("srv:")) {               // GitHub wala gaana: seedha link se stream
    const t = trackById(fid);
    if (!t || !t.url) throw new Error("missing");
    return t.url;
  }
  if (urlCache[fid]) return urlCache[fid];
  const rec = await idb.get("blobs", fid);
  if (!rec || !rec.blob) throw new Error("missing");
  urlCache[fid] = URL.createObjectURL(rec.blob);
  return urlCache[fid];
}

// ---------- Player: asli gaana, bina kisi chhed-chhad ke ----------
const audio = $("#localAudio");
const POS_NAMES = { start: "🎬 Shuru se", mid: "🎯 Beech se", end: "🏁 End se", random: "🎲 Random" };

const player = {
  fadeIv: null,
  timer: null,
  async load(t) {
    const url = await getLocalUrl(t.id);
    if (audio.dataset.fid !== String(t.id)) {
      audio.src = url;
      audio.dataset.fid = t.id;
    }
    if (audio.readyState < 1) {
      await new Promise((res, rej) => {
        audio.addEventListener("loadedmetadata", res, { once: true });
        audio.addEventListener("error", () => rej(new Error("load")), { once: true });
      });
    }
    return isFinite(audio.duration) ? audio.duration : 180;
  },
  // from second se len second bajao — halka fade-in / fade-out (ringtone jaisa)
  async play(t, from, len) {
    this.stop(true);
    const dur = await this.load(t);
    audio.currentTime = Math.max(0, Math.min(from, Math.max(0, dur - 1)));
    audio.volume = 0;
    await audio.play();
    this.ramp(1, 300);
    this.timer = setTimeout(() => this.ramp(0, 600, true), Math.max(300, len * 1000 - 600));
    return len;
  },
  ramp(to, ms, pauseAtEnd) {
    clearInterval(this.fadeIv);
    const from = audio.volume, t0 = performance.now();
    this.fadeIv = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * p));
      if (p >= 1) {
        clearInterval(this.fadeIv);
        if (pauseAtEnd) { audio.pause(); audio.volume = 1; }
      }
    }, 30);
  },
  stop(hard) {
    clearTimeout(this.timer);
    clearInterval(this.fadeIv);
    if (hard || audio.paused) { try { audio.pause(); } catch (e) {} audio.volume = 1; }
    else this.ramp(0, 250, true);
  }
};

// Phone vibrate (gaane se pehle "brrr brrr")
function vibrate() {
  music.unlock(true);
  const c = music.ctx;
  if (!c) return;
  [0, 0.32].forEach((dt) => {
    const t = c.currentTime + 0.02 + dt;
    const o = c.createOscillator(); o.type = "square"; o.frequency.value = 55;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 400;
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.linearRampToValueAtTime(0.12, t + 0.01);
    e.gain.setValueAtTime(0.12, t + 0.21); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(lp); lp.connect(e); e.connect(c.destination); o.start(t); o.stop(t + 0.3);
  });
}

// Gaana kis second se bajega: gaane ka apna "Start" > setting (Shuru / Beech / End / Random)
function pickStart(t, dur, len) {
  const maxS = Math.max(0, dur - len);
  if (hasStart(t.start)) return Math.min(+t.start, maxS);
  let st;
  switch (state.settings.pos) {
    case "start": st = CONFIG.START_SKIP || 0; break;
    case "end": st = dur - len - (CONFIG.END_GAP ?? 12); break;
    case "random": st = dur * 0.1 + Math.random() * Math.max(0, dur * 0.8 - len); break;
    default: st = dur / 2 - len / 2;
  }
  return Math.max(0, Math.min(Math.floor(st), maxS));
}
function fmtSec(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

// ---------- State ----------
const state = {
  settings: {
    count: CONFIG.DEFAULT_COUNT,
    clip: CONFIG.DEFAULT_CLIP,
    pos: CONFIG.DEFAULT_POS || "mid",
    lang: "Mix",
    replay: CONFIG.REPLAY_LIMIT,
    ...store.get("rp_settings2", {})
  },
  game: null,
  view: "setup"
};
function saveSettings() { store.set("rp_settings2", state.settings); }

function playableSongs() {
  const lang = state.settings.lang;
  return localTracks.filter((t) => (lang === "Mix" || t.lang === lang) && !broken.has(t.id) && !t.hidden);
}

// ---------- Setup ----------
function renderSetup() {
  const S = state.settings;
  setSeg("#posSeg", S.pos);
  setSeg("#countSeg", S.count);
  setSeg("#clipSeg", S.clip);
  setSeg("#langSeg", S.lang);
  setSeg("#replaySeg", S.replay);
  const pool = playableSongs();
  const custom = pool.filter((t) => hasStart(t.start)).length;
  const web = pool.filter((t) => t.src === "server").length;
  $("#songCountInfo").textContent = localTracks.length
    ? `🎵 ${pool.length} gaane ready${web ? ` (🌐 ${web} GitHub se — internet chahiye)` : ""} · ${POS_NAMES[S.pos]} bajenge${custom ? ` (${custom} gaane apne "Start" second se)` : ""}.${web ? "" : " Bina internet chalega."}`
    : `📁 Abhi koi gaana nahi. "Gaane" tab mein mp3 files daalo.`;
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
bindSeg("#posSeg", "pos", false);
bindSeg("#countSeg", "count", true);
bindSeg("#clipSeg", "clip", true);
bindSeg("#langSeg", "lang", false);
bindSeg("#replaySeg", "replay", true);
$("#startBtn").addEventListener("click", startGame);

// ---------- Game (koi team nahi — phone bajao, sab milke pehchano) ----------
let stopTimer, tickTimer, revealTimer;

function stopAudio() {
  clearTimeout(stopTimer);
  clearInterval(tickTimer);
  clearTimeout(revealTimer);
  if (state.game) state.game.token++;
  player.stop(true);
}

function startGame() {
  const pool = playableSongs();
  if (!pool.length) return toast("Is language ka koi gaana nahi — 'Gaane' tab mein mp3 files daalo", 3500);
  music.unlock(true);
  const total = state.settings.count ? Math.min(state.settings.count, pool.length) : pool.length;
  state.game = { total, done: 0, song: null, phase: "ready", played: new Set(), replaysLeft: 0, failCount: 0, hint: false, token: 0, left: 0, startUsed: null };
  showView("game");
  renderGame();
}

function renderControls() {
  const g = state.game;
  const B = (id, text, cls = "", dis = false) => `<button class="btn ${cls}" data-act="${id}" ${dis ? "disabled" : ""}>${text}</button>`;
  const last = g.done >= g.total;
  let html = "";
  switch (g.phase) {
    case "ready": html = B("play", "📞 Phone bajao", "hero"); break;
    case "loading": html = B("skip", "⏭ Doosra gaana", "ghost"); break;
    case "ringing": html = B("stop", "⏹ Rok do", "ghost"); break;
    case "rung":
      html = B("replay", `🔁 Dobara (${g.replaysLeft})`, "ghost", g.replaysLeft <= 0) +
             B("hint", "💡 Hint", "ghost", g.hint) +
             B("reveal", "👀 Answer dikhao", "hero") +
             B("skip", "⏭ Skip", "ghost");
      break;
    case "reveal":
      html = (last ? B("finish", "🎆 Party khatam karo", "hero") : B("next", "📞 Agli call", "hero")) +
             B("more", "🔁 Phir se suno", "ghost") +
             B("ahead", "⏩ Aage ka suno", "ghost");
      break;
  }
  $("#controls").innerHTML = html;
}

function renderGame() {
  const g = state.game;
  if (!g) return;
  const no = g.phase === "reveal" ? g.done : g.done + 1;
  $("#songNo").textContent = `Call ${Math.min(Math.max(1, no), g.total)} / ${g.total}`;
  const custom = g.song && hasStart(g.song.start);
  $("#modeBadge").textContent = g.phase === "ready" || !g.song ? POS_NAMES[state.settings.pos]
    : custom ? `📍 ${fmtSec(g.startUsed || 0)} se` : `${POS_NAMES[state.settings.pos]}${g.startUsed != null ? " · " + fmtSec(g.startUsed) : ""}`;

  const phone = $("#phone");
  phone.classList.toggle("ringing", g.phase === "ringing");
  phone.classList.toggle("connected", g.phase === "reveal");
  phone.classList.toggle("missed", g.phase === "rung");
  $(".deck").classList.toggle("playing", g.phase === "ringing" || g.phase === "reveal");
  $("#phoneScreen").innerHTML = phoneHtml(g);
  if (g.phase === "ready" || g.phase === "loading") { const b = $("#progressBar"); b.style.transition = "none"; b.style.width = "0"; }

  $("#status").innerHTML = {
    ready: g.done === 0 ? "Phone bajega — gaana pehchano! 📞" : "Agli call ke liye taiyaar? 👂",
    loading: "Call connect ho rahi hai…",
    ringing: "🎧 Kaunsa gaana hai?",
    rung: g.hint ? "💡 Ab toh pehchan lo!" : "🤔 Pehchana? Jaldi bolo!",
    reveal: ""
  }[g.phase] || "";

  $("#reveal").classList.toggle("hidden", g.phase !== "reveal");
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

function doAct(act) {
  const g = state.game;
  if (!g) return;
  switch (act) {
    case "play":
    case "next": g.failCount = 0; stopAudio(); playNewSong(); break;
    case "skip": stopAudio(); g.failCount = 0; playNewSong(); break;
    case "stop": endRing(); break;
    case "replay": if (g.replaysLeft > 0) { g.replaysLeft--; startRing(); } break;
    case "hint": g.hint = true; music.sfx("ting"); renderGame(); break;
    case "reveal":
      stopAudio();
      g.done++;
      g.phase = "reveal";
      renderGame();
      music.sfx("tada");
      { const r = $("#reveal").getBoundingClientRect(); setTimeout(() => burst(r.left + r.width / 2, r.top + 10, 70), 1200); }
      revealTimer = setTimeout(() => player.play(g.song, g.startUsed || 0, CONFIG.REVEAL_CLIP).catch(() => {}), 1300);
      break;
    case "more": stopAudio(); player.play(g.song, g.startUsed || 0, CONFIG.REVEAL_CLIP).catch(() => {}); break;
    case "ahead": stopAudio(); player.play(g.song, (g.startUsed || 0) + state.settings.clip, CONFIG.REVEAL_CLIP).catch(() => {}); break;
    case "finish": startOutro(); break;
  }
}
$("#controls").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b && !b.disabled) doAct(b.dataset.act);
});
$("#phoneScreen").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (b && !b.disabled && b.dataset.act) doAct(b.dataset.act);
});
document.addEventListener("keydown", (e) => {
  if (document.body.classList.contains("cine-mode") || state.view !== "game" || !state.game) return;
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
  const g = state.game, ph = g.phase;
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    const primary = { ready: "play", ringing: "stop", rung: "reveal", reveal: g.done >= g.total ? "finish" : "next" }[ph];
    if (primary) doAct(primary);
  }
  if ((e.key === "h" || e.key === "H") && ph === "rung" && !g.hint) doAct("hint");
  if ((e.key === "r" || e.key === "R") && ph === "rung" && g.replaysLeft > 0) doAct("replay");
  if (e.key === "Escape" && (ph === "ringing" || ph === "loading")) doAct(ph === "ringing" ? "stop" : "skip");
});
$("#endGameBtn").addEventListener("click", () => {
  if (confirm("Party ka game khatam karke ending dikhayein?")) startOutro();
});

function pickSong() {
  const g = state.game;
  let pool = playableSongs().filter((s) => !g.played.has(s.id));
  if (!pool.length) {
    g.played.clear();
    pool = playableSongs();
    if (pool.length) toast("Saare gaane baj gaye — list dobara shuru");
  }
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

function playNewSong() {
  const g = state.game;
  const s = pickSong();
  if (!s) { g.phase = "ready"; renderGame(); return toast("Koi chalne wala gaana nahi bacha. 'Gaane' tab check karo."); }
  g.song = s;
  g.played.add(s.id);
  g.replaysLeft = state.settings.replay;
  g.hint = false;
  g.startUsed = null;
  startRing();
}

// Gaana load → vibrate → bajao
async function startRing() {
  const g = state.game;
  stopAudio();
  const my = ++g.token;
  g.phase = "loading";
  renderGame();
  const len = state.settings.clip;
  let dur;
  try { dur = await player.load(g.song); } catch (e) { if (my === g.token) onSongFail(); return; }
  if (my !== g.token) return;
  if (g.startUsed == null) g.startUsed = pickStart(g.song, dur, len);
  g.phase = "ringing";
  g.left = len;
  renderGame();
  vibrate();
  await sleep(750);
  if (my !== g.token) return;
  try { await player.play(g.song, g.startUsed, len); } catch (e) { if (my === g.token) onSongFail(); return; }
  if (my !== g.token) { player.stop(true); return; }
  runCountdown(len);
  stopTimer = setTimeout(() => { if (my === g.token) endRing(); }, len * 1000 + 200);
}

function onSongFail() {
  const g = state.game;
  player.stop(true);
  if (g.song) broken.add(g.song.id);
  g.failCount++;
  if (g.failCount >= 5) {
    g.phase = "ready";
    renderGame();
    return toast("Gaane chal nahi rahe — 'Gaane' tab mein files check karo", 4000);
  }
  toast(`"${g.song ? g.song.title : "Gaana"}" ki file nahi chali — doosra laga rahe hain`);
  playNewSong();
}

function endRing() {
  const g = state.game;
  clearTimeout(stopTimer);
  clearInterval(tickTimer);
  g.token++;
  player.stop();
  $("#progressBar").style.width = "100%";
  g.phase = "rung";
  renderGame();
}

function runCountdown(sec) {
  const g = state.game;
  const t0 = performance.now();
  const bar = $("#progressBar");
  bar.style.transition = "none";
  bar.style.width = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.style.transition = `width ${sec}s linear`;
    bar.style.width = "100%";
  }));
  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    g.left = Math.max(0, Math.ceil(sec - (performance.now() - t0) / 1000));
    const el = $("#callTimer");
    if (el) el.textContent = g.left;
  }, 200);
}

// ---------- Gaane tab ----------
function renderLocalTable() {
  const body = $("#localTable tbody");
  $("#localSummary").textContent = localTracks.length ? `(${localTracks.length})` : "";
  if (!localTracks.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">Abhi koi gaana nahi — upar "Files chuno" ya "Poora folder" dabao</td></tr>`;
    return;
  }
  body.innerHTML = localTracks.map((t, i) => `<tr data-fid="${esc(t.id)}" class="${t.hidden ? "row-hidden" : ""}">
      <td>${i + 1}${t.src === "server" ? ' <span title="GitHub se">🌐</span>' : ""}</td>
      <td><input class="f-title" type="text" value="${esc(t.title)}" title="${esc(t.file)}"></td>
      <td><input class="f-singer" type="text" value="${esc(t.singer)}" placeholder="Singer"></td>
      <td><input class="f-movie" type="text" value="${esc(t.movie)}" placeholder="Movie (hint)"></td>
      <td><select class="f-lang"><option${t.lang === "Hindi" ? " selected" : ""}>Hindi</option><option${t.lang === "Punjabi" ? " selected" : ""}>Punjabi</option></select></td>
      <td><input class="start f-start" type="number" min="0" value="${hasStart(t.start) ? +t.start : ""}" placeholder="auto"></td>
      <td><div class="acts">
        <button data-lplay="1" title="Jaise game mein bajega waise suno">▶</button>
        ${t.src === "server"
          ? `<button data-lhide="1" title="${t.hidden ? "Game mein wapas lao" : "Game mein mat bajao (GitHub se hatana ho toh repo se delete karo)"}">${t.hidden ? "👁" : "🙈"}</button>`
          : `<button data-ldel="1" title="Hatao">🗑</button>`}
      </div></td>
    </tr>`).join("");
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
  if (c.contains("f-movie")) updateTrack(id, { movie: e.target.value.trim() });
  if (c.contains("f-lang")) updateTrack(id, { lang: e.target.value }).then(renderSetup);
  if (c.contains("f-start")) updateTrack(id, { start: e.target.value === "" ? null : Math.max(0, +e.target.value) }).then(renderSetup);
});
$("#localTable").addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const tr = b.closest("tr[data-fid]");
  const t = tr && trackById(tr.dataset.fid);
  if (!t) return;
  if (b.dataset.lplay) {
    stopAudio();
    try {
      const len = state.settings.clip;
      const dur = await player.load(t);
      const st = pickStart(t, dur, len);
      await player.play(t, st, len);
      toast(`▶ ${t.title} — ${fmtSec(st)} se ${len} sec (gaana ${fmtSec(dur)} ka hai)`, 3000);
    } catch (err) {
      broken.add(t.id);
      toast("Ye file nahi chali");
    }
  } else if (b.dataset.lhide) {
    await updateTrack(t.id, { hidden: !t.hidden });
    renderLocalTable();
    renderSetup();
  } else if (b.dataset.ldel && confirm("Ye gaana list se hatana hai?")) {
    const id = t.id;
    stopAudio();
    try { await idb.del("meta", id); await idb.del("blobs", id); await idb.del("blobs", id + "_inst"); } catch (err) {}
    if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; }
    if (audio.dataset.fid === id) { audio.removeAttribute("src"); audio.dataset.fid = ""; }
    await loadLocalTracks();
    renderLocalTable();
    renderSetup();
  }
});

// ---------- GitHub ke gaane (repo ka "songs" folder) ----------
// Repo mein songs/ folder ke andar mp3 daalo → link kisi bhi phone/laptop pe kholo → gaane apne aap aa jaate hain.
// Gaane download nahi hote, zaroorat pe stream hote hain (isliye internet chahiye).
const AUDIO_RX = /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i;
// Folder ka naam "songs" ho ya "Songs" — dono chalega (GitHub pe asli naam dhoondh lete hain)
let resolvedFolder = null;
function wantedFolder() { return String(CONFIG.SONGS_FOLDER || "songs").replace(/^\/+|\/+$/g, ""); }
function songsFolder() { return resolvedFolder || wantedFolder(); }

// Repo ka naam link se pehchano: <owner>.github.io/<repo>/
function repoInfo() {
  if (CONFIG.GITHUB_REPO) { const [o, r] = CONFIG.GITHUB_REPO.split("/"); return o && r ? { o, r } : null; }
  const h = location.hostname;
  if (!h.endsWith(".github.io")) return null;
  const o = h.slice(0, -".github.io".length);
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return { o, r: seg && !/\.html?$/i.test(seg) ? seg : h };
}

async function listServerSongs() {
  if (Array.isArray(CONFIG.SONGS) && CONFIG.SONGS.length) return CONFIG.SONGS.filter((n) => AUDIO_RX.test(n));
  // songs/list.json (optional — GitHub ke bina kisi aur hosting pe)
  const w = wantedFolder();
  const variants = [...new Set([w, w.toLowerCase(), w[0].toUpperCase() + w.slice(1).toLowerCase(), w.toUpperCase()])];
  for (const f of variants) {
    try {
      const r = await fetch(f + "/list.json", { cache: "no-store" });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) { resolvedFolder = f; return j.filter((n) => AUDIO_RX.test(n)); } }
    } catch (e) {}
  }
  const ri = repoInfo();
  if (!ri) return null;
  const api = `https://api.github.com/repos/${ri.o}/${ri.r}/contents/`;
  // Repo ke andar folder dhoondo (chhote-bade akshar ka farak nahi)
  const root = await fetch(api, { cache: "no-store" });
  if (!root.ok) throw new Error("github " + root.status);
  const items = await root.json();
  const dir = (Array.isArray(items) ? items : []).find((x) => x.type === "dir" && x.name.toLowerCase() === w.toLowerCase());
  if (!dir) return [];
  resolvedFolder = dir.name;
  const r = await fetch(api + encodeURIComponent(dir.name), { cache: "no-store" });
  if (!r.ok) throw new Error("github " + r.status);
  const j = await r.json();
  return (Array.isArray(j) ? j : []).filter((x) => x.type === "file" && AUDIO_RX.test(x.name)).map((x) => x.name);
}

// Gaane ka sirf shuru ka hissa lao (naam/singer padhne ke liye) — poora gaana download nahi
async function fetchHead(url, n = 262144) {
  const ctrl = new AbortController();
  const r = await fetch(url, { headers: { Range: `bytes=0-${n - 1}` }, signal: ctrl.signal });
  if (!r.ok) throw new Error("fetch " + r.status);
  if (r.status === 206 || !r.body) return (await r.blob()).slice(0, n);
  const reader = r.body.getReader();
  const chunks = [];
  let got = 0;
  while (got < n) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
  }
  try { ctrl.abort(); } catch (e) {}
  return new Blob(chunks).slice(0, n);
}

let syncing = false;
async function loadServerSongs(manual) {
  if (location.protocol === "file:") {
    if (manual) toast("Ye button GitHub link pe chalta hai. Laptop se seedha kholne pe 'Files chuno' use karo.", 4000);
    return;
  }
  if (syncing) return;
  syncing = true;
  const btn = $("#syncBtn");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ GitHub se la rahe hain…"; }
  let names, fromCache = false;
  try {
    names = await listServerSongs();
    if (names) store.set("rp_srvlist2", { folder: songsFolder(), names });
  } catch (e) {
    const c = store.get("rp_srvlist2", null);
    names = c ? c.names : null;
    if (c && c.folder) resolvedFolder = c.folder;
    fromCache = true;
  }
  let added = 0, removed = 0;
  if (names) {
    names = names.filter((n) => !SKIP_RX.test(n));
    const folder = songsFolder();
    for (const name of names) {
      const id = "srv:" + name;
      const url = encodeURIComponent(folder) + "/" + encodeURIComponent(name);
      const t = trackById(id);
      if (t) { if (t.url !== url) await updateTrack(id, { url }); continue; }
      if (btn) btn.textContent = `⏳ Gaane aa rahe hain… ${added + 1}`;
      let info = parseFileName(name);
      try { info = await smartInfo(new File([await fetchHead(url)], name)); } catch (e) {}
      const lang = CONFIG.SONGS_LANG && CONFIG.SONGS_LANG !== "auto" ? CONFIG.SONGS_LANG : guessLang(info.singer, name, info.genre);
      const meta = { id, src: "server", url, file: name, added: Date.now() + added, title: info.title || "Bina naam", singer: info.singer || "", movie: info.movie || "", lang, start: null, hidden: false };
      try { await idb.put("meta", meta); localTracks.push(meta); added++; } catch (e) {}
    }
    // Jo gaane GitHub se hata diye, unhe yahan se bhi hatao (cache wali list pe nahi)
    if (!fromCache) {
      const keep = new Set(names.map((n) => "srv:" + n));
      for (const t of localTracks.filter((x) => x.src === "server" && !keep.has(x.id))) {
        try { await idb.del("meta", t.id); removed++; } catch (e) {}
      }
    }
  }
  await loadLocalTracks();
  renderLocalTable();
  renderSetup();
  syncing = false;
  if (btn) { btn.disabled = false; btn.textContent = "🔄 GitHub se gaane laao"; }
  const total = localTracks.filter((t) => t.src === "server").length;
  if (!names) { if (manual) toast("GitHub repo nahi pehchana — config.js mein GITHUB_REPO bhar do", 4500); return; }
  if (manual || added || removed) {
    const parts = [`🌐 GitHub ke ${total} gaane ready`];
    if (added) parts.push(`${added} naye`);
    if (removed) parts.push(`${removed} hataye`);
    if (fromCache) parts.push("(abhi purani list — GitHub thodi der baad try karo)");
    if (!total) parts.push(`— repo ke "${songsFolder()}" folder mein mp3 daalo`);
    toast(parts.join(" · "), 4500);
  }
}
$("#syncBtn").addEventListener("click", () => loadServerSongs(true));
// ---------- Navigation ----------
function showView(v) {
  state.view = v;
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $("#screen-" + v).classList.add("active");
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.nav !== "intro" && (t.dataset.nav === "songs") === (v === "songs")));
  if (v === "songs") renderLocalTable();
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
    if (state.game && ["ringing", "loading"].includes(state.game.phase)) { stopAudio(); state.game.phase = "rung"; }
    else stopAudio();
    return showView("songs");
  }
  stopAudio();
  goToGameArea();
}));

function hintText(s) {
  const blank = (w) => esc(String(w).split(/\s+/).filter(Boolean).map((x) => x[0].toUpperCase() + " _".repeat(Math.max(0, x.length - 1))).join("   "));
  const bits = [];
  if (s.movie) bits.push("🎬 " + blank(s.movie));
  if (s.singer) bits.push("🎤 " + esc(s.singer.split(/[,&]/)[0].trim()));
  if (!bits.length) bits.push("🔤 " + blank(s.title));
  return bits.join("<br>");
}

function phoneHtml(g) {
  const s = g.song;
  const eq = `<div class="eq">${"<i></i>".repeat(7)}</div>`;
  const btns = (dec, acc) => `<div class="call-btns">
      <button class="call-btn decline" data-act="${dec || ""}" ${dec ? "" : "disabled"} title="Kaato"><span>📞</span></button>
      <button class="call-btn accept" data-act="${acc || ""}" ${acc ? "" : "disabled"} title="Uthao"><span>📞</span></button>
    </div>`;
  switch (g.phase) {
    case "ready":
      return `<div class="call-label">${g.done === 0 ? "Party mode on" : "Agli call…"}</div>
        <div class="caller-avatar idle">📱</div>
        <div class="caller-name">${g.done === 0 ? "Pehli call aane wali hai" : "Agli call aane wali hai"}</div>
        <div class="caller-sub">Sab taiyaar? 👂</div>
        ${btns("", "play")}`;
    case "loading":
      return `<div class="call-label">Connecting…</div>
        <div class="caller-avatar">⏳</div>
        <div class="caller-name">Ringtone ban rahi hai</div>
        <div class="caller-sub">bas ek second…</div>
        ${btns("stop", "")}`;
    case "ringing":
      return `<div class="call-label">📞 Incoming call…</div>
        <div class="caller-avatar">🎶</div>
        <div class="caller-name">Unknown Gaana</div>
        <div class="caller-sub">+91 ••••• •••••</div>
        ${eq}
        <div class="call-timer" id="callTimer">${g.left}</div>
        ${btns("stop", "")}`;
    case "rung":
      return `<div class="call-label">📵 Missed call</div>
        <div class="caller-avatar q">❓</div>
        <div class="caller-name">Kaunsa gaana tha?</div>
        ${g.hint ? `<div class="call-hint">💡 ${hintText(s)}</div>` : `<div class="caller-sub">Pehchana? Jaldi bolo!</div>`}
        ${btns("skip", "reveal")}`;
    case "reveal":
      return `<div class="call-label">✅ Call connected</div>
        <div class="caller-avatar ok">🎶</div>
        <div class="caller-name">${esc(s.title)}</div>
        <div class="caller-sub">${esc(s.singer)}${s.movie ? " · " + esc(s.movie) : ""}</div>
        ${eq}
        <div class="caller-sub">🔊 Asli gaana baj raha hai</div>`;
  }
  return "";
}

// Pehle se daale gaano mein file ke andar se naam / singer / movie bharo (khaali jagah hi)
$("#fillTagsBtn").addEventListener("click", async () => {
  if (!localTracks.length) return toast("Pehle gaane daalo");
  const btn = $("#fillTagsBtn");
  btn.disabled = true;
  let changed = 0;
  for (const t of localTracks) {
    try {
      let blob;
      if (t.src === "server") blob = new File([await fetchHead(t.url)], t.file || "song.mp3");
      else {
        const rec = await idb.get("blobs", t.id);
        if (!rec || !rec.blob) continue;
        blob = rec.blob.name ? rec.blob : new File([rec.blob], t.file || "song.mp3");
      }
      const info = await smartInfo(blob);
      const patch = {};
      const cleanT = cleanName(t.title);
      if (info.title && (cleanT !== t.title || normTxt(t.title) !== normTxt(info.title) && /\.(com|in)|official|video|jatt/i.test(t.title))) patch.title = info.title;
      if (!t.singer && info.singer) patch.singer = info.singer;
      if (!t.movie && info.movie) patch.movie = info.movie;
      if (Object.keys(patch).length) { await updateTrack(t.id, patch); changed++; }
    } catch (e) {}
  }
  btn.disabled = false;
  renderLocalTable();
  toast(changed ? `🏷 ${changed} gaano mein naam/singer bhar diye` : "Files mein aur kuch naya nahi mila", 3500);
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
  unlock(force) {                      // force = ringtone ke liye (music band ho tab bhi audio chahiye)
    if (!this.enabled() && !force) return;
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
    if (!this.enabled()) return;
    // mp3 tracks pehle se load kar lo taaki scene badalte hi turant bajein
    ["title", "funny", "love", "celebrate", "calm", "ending"].forEach((m) => this.trackFor(m));
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
  piano(L, semi, t, vol = 0.08, dec = 1.8) {      // soft piano
    const f = hz(semi);
    [[1, 1], [2, 0.42], [3, 0.16], [4, 0.07]].forEach(([m, a]) => {
      const o = this.osc("sine", f * m, t);
      o.detune.value = m === 1 ? 0 : 3;
      const e = this.env(t, 0.005, 0, dec / (m * 0.6 + 0.4), vol * a);
      o.connect(e); e.connect(L.g); o.start(t); o.stop(t + dec + 0.3);
    });
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
  // Ending: dheema piano + strings (D – A – Bm – G), cinematic aur emotional
  ending: {
    bpm: 66,
    setup(M, L) { M.drone(L, [-12], 0.01); },
    step(M, L, i, t) {
      const prog = [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]];
      const bar = Math.floor(i / 16) % 4, ch = prog[bar], s = i % 16;
      if (s === 0) { M.pad(L, ch, t, (16 * 60) / 66 / 2, 0.028); M.piano(L, ch[0] - 12, t, 0.11, 3); }
      if (s % 2 === 0) M.piano(L, ch[[0, 1, 2, 1][(s / 2) % 4]] + 12, t, 0.04, 1.8);
      const mel = [{ 0: 16, 6: 14, 8: 12, 12: 14 }, { 0: 14, 4: 16, 8: 14, 12: 11 }, { 0: 12, 6: 14, 8: 16, 12: 19 }, { 0: 21, 4: 19, 8: 17, 12: 14 }][bar];
      if (i >= 64 && mel[s] != null) M.piano(L, mel[s] + 12, t, 0.075, 2.4);
      if (s === 8 && bar === 3) M.bell(L, pick([24, 28, 31]), t, 0.03);
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
const SCENE_MOOD = { title: "title", talk: "funny", checklist: "funny", hearts: "love", welcome: "celebrate", rules: "calm", go: "celebrate", report: "calm", thanks: "ending", quotes: "ending", wish: "ending", credits: "ending" };
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
// Ending: Shukriya → Diwali quotes → Happy Diwali
function startOutro() {
  openCine("outro", [
    { type: "thanks", lanterns: true, letterbox: true },
    { type: "quotes", lanterns: true, letterbox: true },
    { type: "wish" },
    { type: "credits", lanterns: true, letterbox: true }
  ]);
}
// Shabd ek-ek karke ubharte hain (blur → saaf)
function wordsHtml(text, delay = 0, step = 0.12) {
  return String(text).split(/\s+/).filter(Boolean)
    .map((w, i) => `<span class="w" style="animation-delay:${(delay + i * step).toFixed(2)}s">${esc(w)}</span>`).join(" ");
}
// Ghat: paani pe tairte diye + chaand ka aks
function ghatHtml(n = 9) {
  return `<div class="ghat" aria-hidden="true"><div class="water"></div><div class="moon-reflect"></div><div class="float-diyas">${
    Array.from({ length: n }, (_, k) => `<i style="--x:${(k * 11 + 4) % 96}%;--bob:${(2.6 + (k % 4) * 0.5).toFixed(1)}s;--drift:${18 + (k % 5) * 6}s;--dl:-${k * 2.3}s;--s:${(0.65 + ((k * 37) % 5) / 10).toFixed(2)}"><b></b></i>`).join("")
  }</div></div>`;
}
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

    case "thanks": {
      const o = PARTY.OUTRO || {};
      html = `${ghatHtml()}<div class="scene thanks kenburns">
        <div class="rays"></div>
        <div class="moon-orb"></div>
        <p class="kicker">${esc(fillNames(o.THANKS_KICKER || "Aaj ki raat"))}</p>
        <h1 class="gold-text">${esc(fillNames(o.THANKS_TITLE || "Shukriya 🙏"))}</h1>
        <div class="title-rule"></div>
        <p class="sub serif words">${wordsHtml(fillNames(o.THANKS_TEXT || ""), 1.6, 0.16)}</p>
      </div>`;
      later(1800, () => music.sfx("aww"));
      later(11000, nextScene);
      break;
    }

    case "quotes": {
      const o = PARTY.OUTRO || {};
      const qs = o.QUOTES || [];
      html = `${ghatHtml(7)}<div class="scene quotes">
        <p class="kicker">${esc(fillNames(o.QUOTES_KICKER || "Diwali ki kuch baatein"))}</p>
        <div class="quote-stage" id="quoteStage"></div>
        <div class="quote-dots">${qs.map(() => "<i></i>").join("")}</div>
        <div class="diya solo" style="--d:.6s"><i class="flame"></i></div>
      </div>`;
      later(400, () => showQuote(0));
      break;
    }

    case "wish": {
      const o = PARTY.OUTRO || {};
      html = `<div class="scene wish">
        <div class="diya-row" style="margin:0 0 26px">${[0, 1, 2, 3, 4].map((i) => `<div class="diya" style="--d:${0.2 + i * 0.25}s"><i class="flame"></i></div>`).join("")}</div>
        <h1>${esc(fillNames(o.WISH || "Happy Diwali!"))}</h1>
        <p class="sub">${esc(fillNames(o.MESSAGE || ""))}</p>
        ${o.FROM ? `<div class="from">${esc(fillNames(o.FROM))}</div>` : ""}
      </div>`;
      later(200, () => { celebrate(8); music.sfx("sparkle"); });
      later(2600, () => celebrate(6));
      later(10000, nextScene);
      break;
    }

    case "credits": {
      const o = PARTY.OUTRO || {};
      const rows = o.CREDITS || [];
      const dur = 6 + rows.length * 1.8;
      html = `<div class="credits-wrap"><div class="credits" style="--dur:${dur}s">
          <p class="c-title gold-text">${esc(fillNames(o.CREDITS_TITLE || "Ek Diwali ki raat"))}</p>
          ${rows.map((r) => `<div class="c-row"><span class="c-role">${esc(fillNames(r[0]))}</span><span class="c-name">${esc(fillNames(r[1]))}</span></div>`).join("")}
        </div></div>
        <div class="c-end" id="cEnd">
          <div class="diya" style="--d:.3s"><i class="flame"></i></div>
          <h1 class="gold-text">${esc(fillNames(o.CREDITS_END || "Shubh Deepawali"))}</h1>
          <p class="sub serif">${esc(fillNames(o.CREDITS_SUB || ""))}</p>
          <div class="again"><button class="btn ghost" id="againBtn">🔁 Phir se khelo</button></div>
        </div>`;
      later(Math.round(dur * 1000) - 800, () => { const e = $("#cEnd"); if (e) e.classList.add("show"); music.sfx("sparkle"); });
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

// Quotes ek-ek karke (Aage dabao toh agla quote)
function showQuote(i) {
  const qs = (PARTY.OUTRO && PARTY.OUTRO.QUOTES) || [];
  const box = $("#quoteStage");
  if (!box) return;
  if (i >= qs.length) { cine.lineDone = null; return later(500, nextScene); }
  const q = qs[i];
  const text = Array.isArray(q) ? q[0] : q, by = Array.isArray(q) ? q[1] : "";
  box.innerHTML = `<blockquote class="quote-card"><span class="qmark">“</span><p class="words">${wordsHtml(fillNames(text), 0.25, 0.11)}</p>${by ? `<cite>— ${esc(fillNames(by))}</cite>` : ""}</blockquote>`;
  $$(".quote-dots i").forEach((d, k) => d.classList.toggle("on", k === i));
  music.sfx("tick");
  const go = () => {
    cine.lineDone = null;
    cine.timers.forEach(clearTimeout);
    cine.timers = [];
    const c = box.querySelector(".quote-card");
    if (c) c.classList.add("out");
    later(450, () => showQuote(i + 1));
  };
  cine.lineDone = go;
  later(Math.max(5500, 1200 + String(text).split(/\s+/).length * 110 + String(text).length * 55), go);
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
(async function init() {
  await loadLocalTracks();
  renderSetup();
  showView("setup");
  loadServerSongs(false);          // GitHub ke "songs" folder wale gaane (background mein)
  if (PARTY.SHOW_INTRO) {
    $("#cine").dataset.mood = "title";
    $("#splash").classList.remove("hidden");
  } else document.body.classList.remove("cine-mode");
})();
