// ===== Ringtune Pehchano — Config =====
// Gaane: app ke "Gaane" tab se mp3 files daalo (sirf ek baar, browser yaad rakhta hai).

const CONFIG = {
  APP_NAME: "Ringtune Pehchano",
  DEFAULT_MODE: "ringtune",   // "ringtune" | "speaker" | "mix"
  DEFAULT_VOICE: "nokia",     // "nokia" | "marimba" | "bit8" | "bansuri" | "seeti"
  DEFAULT_CLIP: 8,            // ringtone kitne second (8 ya 12)
  DEFAULT_COUNT: 15,          // ek game mein kitne gaane (10 / 15 / 20 / 0 = sab)
  REPLAY_LIMIT: 1,            // ek ringtone kitni baar dobara
  REVEAL_CLIP: 15,            // answer ke baad asli gaana kitne second bajega
  AUTO_START: 0.3             // Start khali ho toh gaane ke kitne hisse se (0.3 = 30% pe, aksar chorus ke paas)
};

// ===== Diwali party: intro story + ending =====
// {H1} / {H2} = hosts ke naam. Line format: [kaun bolega "H1"/"H2", chehra emoji, dialogue, sound effect (optional)]
// Sound effects (line ke 4th jagah ya scene pe sfx: "..."):
//   boing, rimshot (ba-dum-tss), dun (dun dun duuun), scratch (record scratch, music rukta hai),
//   offkey (besura gaana), wah (wah-wah-wah), ting (idea), aww, harp, heartbeat, sparkle, tada, mindblown, pop
// Scene ka mood: title / funny / love / celebrate / calm — usi hisaab se background music aur rang badalte hain
const PARTY = {
  SHOW_INTRO: true,
  MUSIC: true,              // cinematic background music (false = bilkul band)
  INTRO_MUSIC: "",          // poori kahani mein EK hi mp3 chahiye toh yahan path daalo (ye MUSIC_FILES se upar hai)

  // Har mood ka apna instrumental — "music" folder mein mp3 daalo, naam yahi rakho.
  // Koi file nahi mili toh us mood ke liye app khud live music bana lega.
  MUSIC_FILES: {
    title: "music/title.mp3",          // cinematic, dheema, rongte khade
    funny: "music/funny.mp3",          // halka-phulka, comedy
    love: "music/love.mp3",            // bansuri / piano, romantic
    celebrate: "music/celebrate.mp3",  // dhol, festive, Diwali vibe
    calm: "music/calm.mp3"             // sitar / soft, rules & report ke liye
  },

  // Optional: kisi effect ki asli mp3 ho toh yahan (e.g. rimshot: "sfx/rimshot.mp3"). Khali = live bana effect.
  SFX_FILES: {},
  HOSTS: ["Sahil", "Sneha"],
  FACES: ["🧑🏻", "👩🏻"],

  STORY: [
    { type: "title", kicker: "{H1} & {H2} pesh karte hain", title: "Ek Diwali ki raat…", sub: "Thodi hasi, thoda pyaar, aur bahut saari roshni ✨" },

    { type: "talk", caption: "Party se ek hafta pehle, ghar pe…", props: "🏠 🪔", lines: [
      ["H1", "😎", "{H2}, is baar Diwali party apne ghar pe karte hain!"],
      ["H2", "🤨", "Pakka? Pichli baar tum 3 ghante sirf rangoli ka design soch rahe the."],
      ["H1", "😅", "Art hai ji, time lagta hai… Picasso ko bhi laga tha.", "boing"]
    ] },

    { type: "checklist", caption: "Taiyaari shuru. {H2} ki list:", items: [
      ["Kaju katli", true], ["Diye", true], ["Lights", true], ["Rangoli", true], ["Party ka music", false]
    ], lines: [
      ["H2", "😱", "Music?! Music toh bhool hi gaye!", "dun"],
      ["H1", "🤩", "Tension kyun lete ho? Main gaa dunga!", "ting"]
    ] },

    { type: "talk", caption: "Aur phir {H1} ne gaana shuru kiya…", props: "🎤 🎶", shake: true, lines: [
      ["H1", "🥹", "Aaaaa… aaaaaa… 🎶 (pure dil se)", "offkey"],
      ["H2", "🙉", "Ruko ruko! Building ki saari lights flicker hone lagi!", "scratch"],
      ["H1", "😢", "Woh toh… Diwali effect hai.", "wah"],
      ["H2", "😂", "Nahi ji, woh tumhara effect hai.", "rimshot"]
    ] },

    { type: "talk", mood: "love", night: true, lanterns: true, sfx: "harp", caption: "Us raat, chhat pe… diyon ke beech", props: "🪔 ✨ 🪔", lines: [
      ["H1", "🙂", "Sach bataun? Mujhe party se zyada ye pal pasand hai."],
      ["H2", "🥺", "Kaunsa pal?"],
      ["H1", "😊", "Jab sab apne saath hote hain… aur tum bhi."],
      ["H2", "🥰", "Pehli baar tumne bina gaaye itna sureela kuch bola hai.", "aww"]
    ] },

    { type: "hearts", title: "Kyunki Diwali sirf roshni ka nahi…", sub: "apno ka tyohaar hai ❤️" },

    { type: "talk", caption: "Aur phir aaya master plan 💡", props: "💡 🎧", lines: [
      ["H2", "😄", "Accha, romance baad mein… music ka kya?!", "scratch"],
      ["H1", "😅", "Arre haan! Woh toh abhi bhi pending hai.", "boing"],
      ["H2", "🤓", "Hum gaayenge nahi… phone ki ringtone mein gaana bajayenge!", "ting"],
      ["H2", "😏", "Aur guests ko gaana pehchanna padega!"],
      ["H1", "🤯", "Aur jo nahi pehchanega…?", "mindblown"],
      ["H2", "💃", "…woh naachega! Done.", "rimshot"]
    ] },

    { type: "welcome", title: "{H1} & {H2}", sub: "aap sabka Diwali party mein dil se swagat karte hain 🙏" },

    { type: "rules", title: "Khel ke rules", items: [
      ["📱", "Phone bajega — ringtone suno, gaana pehchano"],
      ["💡", "Mushkil lage toh hint milega — phir asli gaana"],
      ["🙋", "Jo sabse pehle sahi naam bataye, woh aaj ka star"],
      ["💃", "Galat jawab? 10 second naach ke dikhao"],
      ["📵", "\"Shaadi kab?\" aur \"Salary kitni?\" — aaj dono banned"]
    ] },

    { type: "go", title: "Ringtune Pehchano!", sub: "Phone bajega, gaana aap batao 📞" }
  ],

  // Reveal ke baad random mazedaar line
  QUIPS: [
    "Nahi pehchana? Dance floor aapka intezaar kar raha hai 💃",
    "Jisne pehchana — ek kaju katli extra 🍬",
    "Galat bola? Koi baat nahi, bas 10 second naach do 😄",
    "Itna aasaan tha yaar! 😂",
    "Sahi jawab pe taaliyan 👏👏",
    "{H1} ne bhi nahi pehchana tha, chill 😅",
    "{H2} ne toh pehli note pe pehchan liya tha 😎"
  ],

  // Game khatam hone pe ending — kisi ka naam nahi, sirf team ki taraf se
  OUTRO: {
    REPORT_TITLE: "Diwali Night Report",
    KPIS: [
      ["📞", "Calls aayi", "{SONGS}"],
      ["🧨", "Patakhe", "∞"],
      ["🍬", "Mithai stock", "0 😅"],
      ["😊", "Khushiyan", "100%"]
    ],
    REPORT_NOTE: "Status: Party successful ✅  Koi error nahi mila.",
    WISH: "Happy Diwali!",
    MESSAGE: "Aapki Diwali roshan, meethi aur bina kisi error ke ho. Naya saal khushiyon se bhara rahe 🪔"
  }
};
