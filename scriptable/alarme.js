// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: clock;

/*
 * Widget Scriptable: alarmele active din aplicația Ceas (Clock).
 *
 * iOS nu lasă Scriptable (sau altă aplicație) să citească direct alarmele.
 * Singura cale e aplicația Scurtături: acțiunea „Obține toate alarmele" le
 * citește și le trimite acestui script, care le salvează. Widgetul afișează
 * apoi ultimele alarme primite. Vezi README.md pentru scurtătură și automatizări.
 *
 * Scriptul are două roluri:
 *  - rulat din Scurtături (cu parametru) → salvează alarmele primite;
 *  - rulat ca widget / în aplicație → afișează alarmele salvate.
 */

// ---------------------------------------------------------------------------
// Configurare
// ---------------------------------------------------------------------------
const CONFIG = {
  // Numele scurtăturii care trimite alarmele. Apăsarea pe widget o rulează.
  shortcutName: "Sincronizare Alarme",
  // Câte alarme să apară în listă (pe lângă următoarea alarmă, afișată mare).
  maxRows: { medium: 3, large: 4 },
  // După câte ore datele sunt considerate vechi (apare ⚠︎).
  staleHours: 24,
};

const STORE_KEY = "alarme-widget.data";
const RECORD_SEP = "##";
const FIELD_SEP = "|";

// ---------------------------------------------------------------------------
// Salvare / citire
// ---------------------------------------------------------------------------
function loadData() {
  try {
    return Keychain.contains(STORE_KEY) ? JSON.parse(Keychain.get(STORE_KEY)) : null;
  } catch (e) {
    return null;
  }
}

function saveData(alarms) {
  Keychain.set(STORE_KEY, JSON.stringify({ updated: Date.now(), alarms }));
}

// ---------------------------------------------------------------------------
// Interpretarea textului primit din Scurtături
// Format: SYNC##07:30|Trezire|luni, marți|Da##08:15|Sală||Nu
// (ora|eticheta|repetare|activă). Doar ora e obligatorie.
// ---------------------------------------------------------------------------
function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function parseTime(s) {
  const m = String(s || "").match(/(\d{1,2})\s*[:.]\s*(\d{2})\s*([ap])?\.?\s*m?\.?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "p";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function isOff(s) {
  // Ignorăm virgulele sau spațiile rămase de la un Enter pus în scurtătură.
  const v = norm(s).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return ["no", "nu", "false", "0", "off", "dezactivat", "dezactivata", "inactiv", "inactiva"].includes(v);
}

function parseInput(input) {
  const raw = Array.isArray(input) ? input.join(RECORD_SEP) : String(input || "");
  const alarms = [];
  for (const rec of raw.split(RECORD_SEP)) {
    // Zilele de repetare pot veni pe mai multe rânduri; le punem pe unul singur.
    const parts = rec.replace(/\r?\n+/g, ", ").split(FIELD_SEP).map((p) => p.trim());
    const t = parseTime(parts[0]);
    if (!t) continue;
    if (parts.length > 3 && isOff(parts[3])) continue;
    alarms.push({ h: t.h, m: t.m, label: parts[1] || "", repeat: parts[2] || "" });
  }
  return alarms;
}

// ---------------------------------------------------------------------------
// Zile de repetare și următoarea sonerie
// ---------------------------------------------------------------------------
const DAY_SHORT = ["Du", "Lu", "Ma", "Mi", "Jo", "Vi", "Sâ"];
const DAY_NAME = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
// Prefixe în română și engleză, indexate după Date.getDay() (0 = duminică).
const DAY_PREFIXES = [
  ["dum", "sun"],
  ["lun", "mon"],
  ["mar", "tue"],
  ["mie", "wed"],
  ["joi", "thu"],
  ["vin", "fri"],
  ["sam", "sat"],
];

function repeatInfo(text) {
  const t = norm(text);
  if (!t || /never|niciodata|nu se repeta|o singura data/.test(t)) return { days: [], label: "O singură dată" };
  if (/every ?day|daily|zilnic|in fiecare zi|toate zilele/.test(t)) return { days: [0, 1, 2, 3, 4, 5, 6], label: "Zilnic" };

  const days = new Set();
  if (/weekday|lucratoare|zile de lucru/.test(t)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  if (/weekend/.test(t)) [0, 6].forEach((d) => days.add(d));
  for (const word of t.split(/[^a-z]+/)) {
    DAY_PREFIXES.forEach((prefixes, d) => {
      if (prefixes.some((p) => word.startsWith(p))) days.add(d);
    });
  }

  const list = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const key = list.join(",");
  if (list.length === 7) return { days: list, label: "Zilnic" };
  if (key === "1,2,3,4,5") return { days: list, label: "Zile lucrătoare" };
  if (key === "6,0") return { days: list, label: "Weekend" };
  if (list.length) return { days: list, label: list.map((d) => DAY_SHORT[d]).join(" ") };
  // Text necunoscut (altă limbă): îl afișăm așa cum e și tratăm alarma ca zilnică.
  return { days: [], label: text };
}

function nextRing(alarm, now) {
  const days = repeatInfo(alarm.repeat).days;
  for (let add = 0; add <= 7; add++) {
    const d = new Date(now);
    d.setDate(now.getDate() + add);
    d.setHours(alarm.h, alarm.m, 0, 0);
    if (d <= now) continue;
    if (!days.length || days.includes(d.getDay())) return d;
  }
  return null;
}

function upcoming(data, now) {
  return ((data && data.alarms) || [])
    .map((a) => ({ ...a, next: nextRing(a, now), repeatLabel: repeatInfo(a.repeat).label }))
    .filter((a) => a.next)
    .sort((a, b) => a.next - b.next);
}

// ---------------------------------------------------------------------------
// Formatare
// ---------------------------------------------------------------------------
function pad(n) {
  return String(n).padStart(2, "0");
}

function timeFmt(a) {
  return pad(a.h) + ":" + pad(a.m);
}

function untilLabel(date, now) {
  const mins = Math.ceil((date - now) / 60000);
  if (mins < 60) return "în " + mins + " min";
  const h = Math.floor(mins / 60);
  if (h < 24) return "în " + h + " h" + (mins % 60 ? " " + (mins % 60) + " min" : "");
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return "mâine";
  return DAY_NAME[date.getDay()];
}

function updatedLabel(ms, now) {
  const d = new Date(ms);
  const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
  if (d.toDateString() === now.toDateString()) return "azi, " + hm;
  return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + ", " + hm;
}

function isStale(data, now) {
  return !data || now - data.updated > CONFIG.staleHours * 3600 * 1000;
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
const COLORS = {
  bg: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
  card: Color.dynamic(new Color("#F2F2F7"), new Color("#2C2C2E")),
  text: Color.dynamic(new Color("#111111"), new Color("#F2F2F7")),
  muted: Color.dynamic(new Color("#6E6E73"), new Color("#98989D")),
  accent: Color.dynamic(new Color("#E07800"), new Color("#FF9F0A")),
  warn: Color.dynamic(new Color("#D70015"), new Color("#FF453A")),
};

function addText(stack, str, font, color, lines) {
  const t = stack.addText(str);
  t.font = font;
  t.textColor = color;
  if (lines) {
    t.lineLimit = lines;
    t.minimumScaleFactor = 0.7;
  }
  return t;
}

function addSymbol(stack, name, size, color) {
  const sym = SFSymbol.named(name);
  sym.applyFont(Font.semiboldSystemFont(size));
  const img = stack.addImage(sym.image);
  img.imageSize = new Size(size, size);
  img.tintColor = color;
  return img;
}

function header(w, data, list, now, small) {
  const row = w.addStack();
  row.centerAlignContent();
  addSymbol(row, "alarm.fill", small ? 13 : 14, COLORS.accent);
  row.addSpacer(5);
  addText(row, "Alarme", Font.semiboldSystemFont(small ? 13 : 14), COLORS.text);
  row.addSpacer();
  if (isStale(data, now)) {
    addSymbol(row, "exclamationmark.triangle.fill", 11, COLORS.warn);
    row.addSpacer(4);
  }
  if (data) {
    const badge = row.addStack();
    badge.backgroundColor = COLORS.card;
    badge.cornerRadius = 8;
    badge.setPadding(1, 7, 1, 7);
    addText(badge, String(list.length), Font.semiboldRoundedSystemFont(12), COLORS.muted);
  }
}

function emptyState(w, data, small) {
  const box = w.addStack();
  box.layoutVertically();
  addSymbol(box, data ? "alarm" : "arrow.triangle.2.circlepath", small ? 22 : 26, COLORS.muted);
  box.addSpacer(6);
  if (data) {
    addText(box, "Nicio alarmă activă", Font.semiboldSystemFont(small ? 14 : 16), COLORS.text, 2);
  } else {
    addText(box, "Încă nu am primit alarmele", Font.semiboldSystemFont(small ? 13 : 15), COLORS.text, 2);
    box.addSpacer(2);
    addText(box, "Rulează scurtătura „" + CONFIG.shortcutName + "”", Font.systemFont(11), COLORS.muted, 3);
  }
}

// Următoarea alarmă, scrisă mare. Numărătoarea inversă e randată de iOS,
// deci rămâne corectă și între reîmprospătările widgetului.
function addNextAlarm(stack, a, size) {
  addText(stack, timeFmt(a), Font.boldRoundedSystemFont(size), COLORS.text, 1);
  if (a.label) addText(stack, a.label, Font.mediumSystemFont(size >= 40 ? 14 : 13), COLORS.text, 1);
  stack.addSpacer(2);
  const until = stack.addStack();
  until.centerAlignContent();
  addText(until, "în ", Font.semiboldSystemFont(12), COLORS.accent);
  const d = until.addDate(a.next);
  d.applyRelativeStyle();
  d.font = Font.semiboldSystemFont(12);
  d.textColor = COLORS.accent;
  d.lineLimit = 1;
  d.minimumScaleFactor = 0.7;
}

function alarmRow(stack, a, now, large) {
  const row = stack.addStack();
  row.centerAlignContent();
  const time = row.addStack();
  time.size = new Size(large ? 58 : 50, 0);
  addText(time, timeFmt(a), Font.semiboldRoundedSystemFont(large ? 18 : 16), COLORS.text, 1);
  time.addSpacer();
  row.addSpacer(6);
  const info = row.addStack();
  info.layoutVertically();
  addText(info, a.label || "Alarmă", Font.mediumSystemFont(large ? 13 : 12), COLORS.text, 1);
  addText(info, large ? a.repeatLabel : untilLabel(a.next, now), Font.systemFont(10), COLORS.muted, 1);
  if (large) {
    row.addSpacer();
    addText(row, untilLabel(a.next, now), Font.mediumSystemFont(11), COLORS.muted, 1);
  }
}

function moreText(stack, n) {
  if (n <= 0) return;
  addText(stack, "+" + n + (n === 1 ? " altă alarmă" : " alte alarme"), Font.systemFont(10), COLORS.muted, 1);
}

function buildSmall(w, list, now) {
  const a = list[0];
  addNextAlarm(w, a, 36);
  w.addSpacer();
  const rest = list.slice(1);
  if (rest.length) {
    addText(w, "apoi " + rest.slice(0, 3).map(timeFmt).join(", "), Font.systemFont(11), COLORS.muted, 1);
  } else {
    addText(w, a.repeatLabel, Font.systemFont(11), COLORS.muted, 1);
  }
}

function buildMedium(w, list, now) {
  const row = w.addStack();
  const left = row.addStack();
  left.layoutVertically();
  addNextAlarm(left, list[0], 40);
  left.addSpacer(2);
  addText(left, list[0].repeatLabel, Font.systemFont(10), COLORS.muted, 1);
  row.addSpacer(12);

  const rest = list.slice(1);
  const max = CONFIG.maxRows.medium;
  if (rest.length) {
    const right = row.addStack();
    right.layoutVertically();
    rest.slice(0, max).forEach((a, i) => {
      if (i) right.addSpacer(5);
      alarmRow(right, a, now, false);
    });
    if (rest.length > max) {
      right.addSpacer(4);
      moreText(right, rest.length - max);
    }
  }
  row.addSpacer();
}

function buildLarge(w, data, list, now) {
  const card = w.addStack();
  card.backgroundColor = COLORS.card;
  card.cornerRadius = 16;
  card.setPadding(10, 14, 10, 14);
  card.centerAlignContent();
  const left = card.addStack();
  left.layoutVertically();
  addNextAlarm(left, list[0], 40);
  card.addSpacer();
  const right = card.addStack();
  right.layoutVertically();
  addSymbol(right, "repeat", 13, COLORS.muted);
  right.addSpacer(3);
  addText(right, list[0].repeatLabel, Font.mediumSystemFont(11), COLORS.muted, 2);

  const rest = list.slice(1);
  const max = CONFIG.maxRows.large;
  if (rest.length) {
    w.addSpacer(12);
    addText(w, "APOI", Font.semiboldSystemFont(10), COLORS.muted);
    w.addSpacer(6);
    rest.slice(0, max).forEach((a, i) => {
      if (i) w.addSpacer(6);
      alarmRow(w, a, now, true);
    });
    if (rest.length > max) {
      w.addSpacer(6);
      moreText(w, rest.length - max);
    }
  }
  w.addSpacer();
  const stale = isStale(data, now);
  addText(
    w,
    (stale ? "⚠︎ " : "") + "Sincronizat " + updatedLabel(data.updated, now) + " · atinge pentru actualizare",
    Font.systemFont(9),
    stale ? COLORS.warn : COLORS.muted,
    1
  );
}

function buildHomeWidget(data, list, now, family) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  const small = family === "small";
  w.setPadding(14, 16, 14, 16);
  header(w, data, list, now, small);
  if (family === "large") w.addSpacer(12);
  else w.addSpacer();

  if (!list.length) {
    emptyState(w, data, small);
    w.addSpacer();
  } else if (small) {
    buildSmall(w, list, now);
  } else if (family === "large") {
    buildLarge(w, data, list, now);
  } else {
    buildMedium(w, list, now);
    w.addSpacer();
  }
  return w;
}

function buildAccessoryWidget(list, now, family) {
  const w = new ListWidget();
  const a = list[0];
  if (family === "accessoryInline") {
    w.addText(a ? "⏰ " + timeFmt(a) + " · " + untilLabel(a.next, now) : "⏰ Nicio alarmă");
    return w;
  }
  if (family === "accessoryCircular") {
    w.addSpacer();
    const icon = w.addStack();
    icon.addSpacer();
    addSymbol(icon, "alarm.fill", 12, Color.white());
    icon.addSpacer();
    const t = w.addText(a ? timeFmt(a) : "–");
    t.font = Font.boldRoundedSystemFont(15);
    t.minimumScaleFactor = 0.6;
    t.centerAlignText();
    w.addSpacer();
    return w;
  }
  // accessoryRectangular
  const title = w.addText("⏰ " + (a ? timeFmt(a) : "Nicio alarmă"));
  title.font = Font.boldRoundedSystemFont(16);
  if (a) {
    const l = w.addText(a.label || "Alarmă");
    l.font = Font.semiboldSystemFont(12);
    l.lineLimit = 1;
    const u = w.addText(untilLabel(a.next, now) + (list.length > 1 ? " · +" + (list.length - 1) : ""));
    u.font = Font.systemFont(11);
    u.lineLimit = 1;
  }
  return w;
}

function buildWidget(data, family) {
  const now = new Date();
  const list = upcoming(data, now);
  const w = String(family || "").startsWith("accessory")
    ? buildAccessoryWidget(list, now, family)
    : buildHomeWidget(data, list, now, family || "medium");
  // Reîmprospătăm după următoarea sonerie (alarma trece la sfârșitul listei),
  // dar cel mult la 15 minute, ca să prindem sincronizările noi.
  const soon = new Date(now.getTime() + 15 * 60 * 1000);
  w.refreshAfterDate = list.length && list[0].next < soon ? new Date(list[0].next.getTime() + 60 * 1000) : soon;
  w.url = "shortcuts://run-shortcut?name=" + encodeURIComponent(CONFIG.shortcutName);
  return w;
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------
async function runInApp() {
  const data = loadData();
  const now = new Date();
  const menu = new Alert();
  menu.title = "Alarme";
  menu.message = data
    ? upcoming(data, now).length + " alarme active · sincronizat " + updatedLabel(data.updated, now)
    : "Încă nu am primit alarmele. Rulează scurtătura „" + CONFIG.shortcutName + "”.";
  menu.addAction("Previzualizare mică");
  menu.addAction("Previzualizare medie");
  menu.addAction("Previzualizare mare");
  menu.addAction("Rulează scurtătura acum");
  menu.addDestructiveAction("Șterge alarmele salvate");
  menu.addCancelAction("Închide");
  const choice = await menu.presentSheet();
  if (choice === -1) return;
  if (choice === 3) {
    Safari.open("shortcuts://run-shortcut?name=" + encodeURIComponent(CONFIG.shortcutName));
    return;
  }
  if (choice === 4) {
    if (Keychain.contains(STORE_KEY)) Keychain.remove(STORE_KEY);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
  const family = ["small", "medium", "large"][choice];
  const widget = buildWidget(data, family);
  if (family === "small") await widget.presentSmall();
  else if (family === "medium") await widget.presentMedium();
  else await widget.presentLarge();
}

if (args.shortcutParameter != null) {
  // Rulat din Scurtături: salvăm alarmele primite.
  const alarms = parseInput(args.shortcutParameter);
  saveData(alarms);
  Script.setShortcutOutput(alarms.length + " alarme active salvate");
} else if (config.runsInWidget) {
  Script.setWidget(buildWidget(loadData(), config.widgetFamily));
} else {
  await runInApp();
}
Script.complete();
