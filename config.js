// ===== Gaana Pehchano — Config =====
// yt: YouTube link ya sirf video ID (dono chalega). Khali chhodoge toh woh gaana game mein nahi aayega.
// start: kis second se bajana hai (chorus/hook ke paas rakho). null = app khud random point lega.

const CONFIG = {
  APP_NAME: "Gaana Pehchano",
  DEFAULT_CLIP: 5,          // 5 ya 10 sec
  DEFAULT_ROUNDS: 5,
  REPLAY_LIMIT: 1,          // ek turn mein kitni baar dobara suna sakte hain
  POINTS_CORRECT: 1,
  RANDOM_START_MIN: 35,     // start null ho toh random point is range mein (seconds)
  RANDOM_START_MAX: 90,
  LOAD_TIMEOUT_MS: 12000,
  AD_WAIT_MS: 45000,        // YouTube ad ke liye kitna wait (ad ke time audio mute rehta hai)
  DEFAULT_SOURCE: "local"   // "local" = apni instrumental files (no ads) | "youtube"
};

// ===== Diwali party intro =====
// {H1} aur {H2} ki jagah HOSTS ke naam aa jayenge. Lines jo chaho badal lo.
const PARTY = {
  SHOW_INTRO: true,
  HOSTS: ["Sahil", "Sneha"],
  SCENES: [
    { type: "diya", title: "Happy Diwali!", sub: "Roshni, mithai aur thoda sa shor 🎆" },
    { type: "hosts", title: "{H1} & {H2}", sub: "aap sabka dil se swagat karte hain 🙏" },
    { type: "chat", lines: [
      ["H1", "Sab aa gaye kya?"],
      ["H2", "Haan! Jaldi kaju katli chhupao 🙈"],
      ["H1", "Late aane walon ko sirf soan papdi milegi 😂"],
      ["H2", "Aur jo gaana nahi pehchanega… woh naachega! 💃"]
    ] },
    { type: "rules", title: "Aaj raat ke rules", items: [
      ["🍬", "Kaju katli pe pehla haq hosts ka"],
      ["📵", "\"Shaadi kab?\" aur \"Salary kitni?\" — aaj dono banned"],
      ["💃", "Gaana nahi pehchana? 10 second naach ke dikhao"],
      ["🧨", "Game haarne wala patakhon ka kachra uthayega"]
    ] },
    { type: "go", title: "Toh chalo…", sub: "Gaana Pehchano shuru karein? 🎶" }
  ]
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
