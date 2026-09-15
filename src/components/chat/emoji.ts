// Nejčastější emoji pro rychlé našeptávání přes `:název` (plný výběr je v EmojiPicker).
// Klíčová slova česky i anglicky, bez diakritiky.
export const EMOJI_SHORTCODES: [emoji: string, names: string[]][] = [
  ["👍", ["palec", "thumbsup", "+1", "ok", "like"]],
  ["👎", ["palecdolu", "thumbsdown", "-1"]],
  ["✅", ["hotovo", "check", "done", "fajfka"]],
  ["❌", ["ne", "x", "cross", "zruseno"]],
  ["👀", ["oci", "eyes", "divam", "koukam"]],
  ["🙏", ["dekuji", "diky", "pray", "prosim", "thanks"]],
  ["👏", ["potlesk", "clap", "bravo"]],
  ["🙌", ["hura", "raised_hands", "yay"]],
  ["🎉", ["oslava", "tada", "party", "gratulace"]],
  ["🔥", ["ohen", "fire", "hot", "pecka"]],
  ["💪", ["sila", "muscle", "strong", "makame"]],
  ["🚀", ["raketa", "rocket", "launch", "start"]],
  ["😂", ["smich", "joy", "lol", "haha"]],
  ["🤣", ["rofl", "valim"]],
  ["😊", ["usmev", "smile", "blush"]],
  ["😀", ["grin", "radost"]],
  ["😉", ["wink", "mrk"]],
  ["😅", ["sweat_smile", "uff"]],
  ["😍", ["laska", "heart_eyes", "love"]],
  ["🤔", ["premyslim", "thinking", "hmm"]],
  ["😮", ["wow", "open_mouth", "prekvapeni"]],
  ["😢", ["smutek", "cry", "sad"]],
  ["😬", ["grimacing", "au"]],
  ["🙈", ["see_no_evil", "stydim"]],
  ["🤷", ["shrug", "nevim"]],
  ["🤝", ["handshake", "dohoda", "deal"]],
  ["👋", ["ahoj", "wave", "cau", "hi"]],
  ["👌", ["ok_hand", "super", "perfect"]],
  ["✌️", ["peace", "v"]],
  ["❤️", ["srdce", "heart", "love"]],
  ["💯", ["100", "hundred", "presne"]],
  ["⭐", ["hvezda", "star"]],
  ["✨", ["sparkles", "jiskry", "novinka"]],
  ["⚡", ["blesk", "zap", "rychle"]],
  ["⚠️", ["pozor", "warning", "varovani"]],
  ["❗", ["vykricnik", "exclamation", "dulezite"]],
  ["❓", ["otaznik", "question", "dotaz"]],
  ["⏰", ["budik", "alarm", "deadline"]],
  ["⏳", ["cekam", "hourglass", "waiting"]],
  ["📅", ["kalendar", "calendar", "datum"]],
  ["📌", ["pin", "pripnout", "pushpin"]],
  ["📎", ["priloha", "paperclip", "sponka"]],
  ["📝", ["poznamka", "memo", "note"]],
  ["📣", ["oznameni", "mega", "announcement"]],
  ["💡", ["napad", "bulb", "idea"]],
  ["🎯", ["cil", "dart", "target"]],
  ["📈", ["rust", "chart", "graf"]],
  ["💰", ["penize", "moneybag", "money"]],
  ["🛒", ["kosik", "cart", "eshop"]],
  ["📦", ["balik", "package", "zasilka"]],
  ["🚚", ["doprava", "truck", "dodavka"]],
  ["🚁", ["helikoptera", "helicopter", "dron", "drone"]],
  ["📷", ["foto", "camera", "fotak"]],
  ["🎥", ["video", "movie_camera", "natacani"]],
  ["🎓", ["univerzita", "graduation", "skoleni"]],
  ["☕", ["kafe", "coffee", "kava"]],
  ["🍺", ["pivo", "beer"]],
  ["🍕", ["pizza"]],
  ["🏖️", ["dovolena", "beach", "vacation"]],
  ["🤒", ["nemoc", "sick", "nemocny"]],
  ["🏠", ["doma", "home", "homeoffice"]],
  ["🟢", ["zelena", "green", "online"]],
  ["🟡", ["zluta", "yellow"]],
  ["🔴", ["cervena", "red"]],
];

export function searchShortcodes(query: string, limit = 8) {
  const q = query.toLowerCase();
  const starts = EMOJI_SHORTCODES.filter(([, n]) => n.some((x) => x.startsWith(q)));
  const contains = EMOJI_SHORTCODES.filter(([, n]) => !n.some((x) => x.startsWith(q)) && n.some((x) => x.includes(q)));
  return [...starts, ...contains].slice(0, limit);
}

export const QUICK_REACTIONS = ["👍", "✅", "😂"];

const RECENT_KEY = "chat-recent-emoji";

export function readRecentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecentEmoji().filter((e) => e !== emoji)].slice(0, 16);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage nedostupný (privátní okno) — poslední emoji se prostě nepamatují
  }
}
