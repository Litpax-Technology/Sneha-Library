// ===== Gaana Pehchano — Config =====
// yt: YouTube link ya sirf video ID (dono chalega). Khali chhodoge toh woh gaana game mein nahi aayega.
// start: kis second se bajana hai (chorus/hook ke paas rakho). null = app khud random point lega.

const CONFIG = {
  APP_NAME: "Gaana Pehchano",
  DEFAULT_CLIP: 10,         // 5 ya 10 sec
  DEFAULT_COUNT: 15,        // ek game mein kitne gaane (10 / 15 / 20 / 0 = sab)
  REPLAY_LIMIT: 1,          // ek gaana kitni baar dobara suna sakte hain
  RANDOM_START_MIN: 35,     // start null ho toh random point is range mein (seconds)
  RANDOM_START_MAX: 90,
  LOAD_TIMEOUT_MS: 12000,
  AD_WAIT_MS: 45000,        // YouTube ad ke liye kitna wait (ad ke time audio mute rehta hai)
  DEFAULT_SOURCE: "local"   // "local" = apni instrumental files (no ads) | "youtube"
};

// ===== Diwali party: intro story + ending =====
// {H1} / {H2} = hosts ke naam. Line format: [kaun bolega "H1"/"H2", chehra emoji, dialogue]
const PARTY = {
  SHOW_INTRO: true,
  HOSTS: ["Sahil", "Sneha"],
  FACES: ["🧑🏻", "👩🏻"],

  STORY: [
    { type: "title", title: "Ek Diwali ki raat…", sub: "Ek bilkul sacchi kahani. Thoda masala daal ke 😏" },

    { type: "talk", caption: "Party se ek hafta pehle, ghar pe…", props: "🏠 🪔", lines: [
      ["H1", "😎", "{H2}, is baar Diwali party apne ghar pe karte hain!"],
      ["H2", "🤨", "Pakka? Pichli baar tum 3 ghante sirf rangoli ka design soch rahe the."],
      ["H1", "😅", "Woh… art mein time lagta hai."]
    ] },

    { type: "checklist", caption: "Taiyaari shuru. {H2} ki list:", items: [
      ["Kaju katli", true], ["Diye", true], ["Patakhe", true], ["Rangoli", true], ["Party ka music", false]
    ], lines: [
      ["H2", "😱", "Music?! Music toh bhool hi gaye!"],
      ["H1", "🤩", "Tension kyun? Main gaa dunga!"]
    ] },

    { type: "talk", caption: "Aur phir {H1} ne gaana shuru kiya…", props: "🎤 🎶", shake: true, lines: [
      ["H1", "🥹", "Aaaaa… aaaaaa… 🎶 (pure dil se)"],
      ["H2", "🙉", "Bas karo! Padosi ne kutta chhod diya hai 🐕"],
      ["H1", "😢", "Itna bhi bura nahi tha…"],
      ["H2", "😐", "Kutta bhi bhaag gaya."]
    ] },

    { type: "talk", caption: "Phir aaya master plan 💡", props: "💡 🎧", lines: [
      ["H2", "🤓", "Hum gaayenge nahi. Sirf gaane ki tune bajayenge."],
      ["H2", "😏", "Aur guests ko gaana pehchanna padega!"],
      ["H1", "🤯", "Aur jo nahi pehchanega…?"],
      ["H2", "💃", "…woh naachega! Done."]
    ] },

    { type: "welcome", title: "{H1} & {H2}", sub: "aap sabka Diwali party mein dil se swagat karte hain 🙏" },

    { type: "rules", title: "Khel ke rules", items: [
      ["🎧", "Sirf tune bajegi — gaane ke bol nahi"],
      ["🙋", "Jo sabse pehle sahi naam bataye, woh aaj ka star"],
      ["💃", "Galat jawab? 10 second naach ke dikhao"],
      ["📵", "\"Shaadi kab?\" aur \"Salary kitni?\" — aaj dono banned"]
    ] },

    { type: "go", title: "Gaana Pehchano!", sub: "Tune bajegi, naam aap batao 🎶" }
  ],

  // Reveal ke baad random mazedaar line
  QUIPS: [
    "Nahi pehchana? Dance floor aapka intezaar kar raha hai 💃",
    "Jisne pehchana — ek kaju katli extra 🍬",
    "Galat bola? Koi baat nahi, bas 10 second naach do 😄",
    "Itna aasaan tha yaar! 😂",
    "Sahi jawab pe taaliyan 👏👏",
    "{H1} ne bhi nahi pehchana tha, chill 😅"
  ],

  // Game khatam hone pe ending — kisi ka naam nahi, sirf team ki taraf se
  OUTRO: {
    REPORT_TITLE: "Diwali Night Report",
    KPIS: [
      ["🎶", "Gaane baje", "{SONGS}"],
      ["🧨", "Patakhe", "∞"],
      ["🍬", "Mithai stock", "0 😅"],
      ["😊", "Khushiyan", "100%"]
    ],
    REPORT_NOTE: "Status: Party successful ✅  Koi error nahi mila.",
    WISH: "Happy Diwali!",
    MESSAGE: "Aapki Diwali roshan, meethi aur bina kisi error ke ho. Naya saal khushiyon se bhara rahe 🪔"
  }
};

const SONGS = [
  // ---------- Hindi ----------
  { title: "Kesariya", singer: "Arijit Singh", movie: "Brahmastra", lang: "Hindi", yt: "g6fnFALEseI", start: null },
  { title: "Tum Hi Ho", singer: "Arijit Singh", movie: "Aashiqui 2", lang: "Hindi", yt: "Umqb9KENgmk", start: null },
  { title: "Channa Mereya", singer: "Arijit Singh", movie: "Ae Dil Hai Mushkil", lang: "Hindi", yt: "z-diRlyLGzo", start: null },
  { title: "Apna Bana Le", singer: "Arijit Singh", movie: "Bhediya", lang: "Hindi", yt: "ElZfdU54Cp8", start: null },
  { title: "Satranga", singer: "Arijit Singh", movie: "Animal", lang: "Hindi", yt: "", start: null },
  { title: "Chaleya", singer: "Arijit Singh, Shilpa Rao", movie: "Jawan", lang: "Hindi", yt: "VAdGW7QDJiU", start: null },
  { title: "Jhoome Jo Pathaan", singer: "Arijit Singh, Sukriti Kakar", movie: "Pathaan", lang: "Hindi", yt: "YxWlaYCA8MU", start: null },
  { title: "Raataan Lambiyan", singer: "Jubin Nautiyal, Asees Kaur", movie: "Shershaah", lang: "Hindi", yt: "gvyUuxdRdR4", start: null },
  { title: "Kabira", singer: "Tochi Raina, Rekha Bhardwaj", movie: "Yeh Jawaani Hai Deewani", lang: "Hindi", yt: "jHNNMj5bNQw", start: null },
  { title: "Badtameez Dil", singer: "Benny Dayal", movie: "Yeh Jawaani Hai Deewani", lang: "Hindi", yt: "II2EO3Nw4m0", start: null },
  { title: "London Thumakda", singer: "Labh Janjua, Sonu Kakkar, Neha Kakkar", movie: "Queen", lang: "Hindi", yt: "udra3Mfw2oo", start: null },
  { title: "Malhari", singer: "Vishal Dadlani", movie: "Bajirao Mastani", lang: "Hindi", yt: "l_MyUGq7pgs", start: null },
  { title: "Kal Ho Naa Ho", singer: "Sonu Nigam", movie: "Kal Ho Naa Ho", lang: "Hindi", yt: "g0eO74UmRBs", start: null },
  { title: "Chaiyya Chaiyya", singer: "Sukhwinder Singh, Sapna Awasthi", movie: "Dil Se", lang: "Hindi", yt: "PQmrmVs10X8", start: null },
  { title: "Pehle Bhi Main", singer: "Vishal Mishra", movie: "Animal", lang: "Hindi", yt: "", start: null },
  { title: "Aaj Ki Raat", singer: "Madhubanti Bagchi, Divya Kumar", movie: "Stree 2", lang: "Hindi", yt: "", start: null },

  // ---------- Punjabi ----------
  { title: "Brown Munde", singer: "AP Dhillon, Gurinder Gill, Shinda Kahlon", movie: "", lang: "Punjabi", yt: "VNs_cCtdbPc", start: null },
  { title: "Excuses", singer: "AP Dhillon, Gurinder Gill", movie: "", lang: "Punjabi", yt: "vX2cDW8LUWk", start: null },
  { title: "Insane", singer: "AP Dhillon", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Softly", singer: "Karan Aujla", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Tauba Tauba", singer: "Karan Aujla", movie: "Bad Newz", lang: "Punjabi", yt: "", start: null },
  { title: "Admirin' You", singer: "Karan Aujla", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Sheikh", singer: "Karan Aujla", movie: "", lang: "Punjabi", yt: "4uMchksQJng", start: null },
  { title: "Lover", singer: "Diljit Dosanjh", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Born To Shine", singer: "Diljit Dosanjh", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "G.O.A.T.", singer: "Diljit Dosanjh", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Patiala Peg", singer: "Diljit Dosanjh", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "295", singer: "Sidhu Moose Wala", movie: "", lang: "Punjabi", yt: "n_FCrCQ6-bA", start: null },
  { title: "So High", singer: "Sidhu Moose Wala", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Lehanga", singer: "Jass Manak", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Prada", singer: "Jass Manak", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Qismat", singer: "Ammy Virk", movie: "Qismat", lang: "Punjabi", yt: "", start: null },
  { title: "Filhaal", singer: "B Praak", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Mann Bharrya", singer: "B Praak", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "High Rated Gabru", singer: "Guru Randhawa", movie: "", lang: "Punjabi", yt: "", start: null },
  { title: "Lahore", singer: "Guru Randhawa", movie: "", lang: "Punjabi", yt: "dZ0fwJojhrs", start: null }
];
