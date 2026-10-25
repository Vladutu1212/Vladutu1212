// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: bus;

/*
 * Widget Scriptable: sosirile liniei 435 în stația I.N.M.H,
 * pe sensul către „Pasaj CFR Chitila".
 *
 * Datele vin de la același server pe care îl folosește aplicația Info TB
 * (info.stb.ro). iOS nu permite altor aplicații să citească datele din Info TB,
 * așa că scriptul întreabă direct serverul, la fel ca aplicația.
 *
 * Nu e nevoie de cont STB și nici de vreo permisiune în iOS: doar internet.
 */

// ---------------------------------------------------------------------------
// Configurare – poți schimba linia, stația sau sensul aici.
// ---------------------------------------------------------------------------
const CONFIG = {
  line: "435",
  // Numele stației și al capătului de linie, așa cum apar în Info TB.
  stopName: "I.N.M.H",
  directionName: "Pasaj CFR Chitila",
  // Dacă detectarea automată nu găsește stația, pune aici ID-ul stației
  // (număr) și, opțional, sensul (0 sau 1). Altfel lasă null.
  stopId: null,
  direction: null,
  // Câte sosiri să afișeze.
  maxArrivals: 3,
  // Ce se deschide când apeși pe widget (null = rulează scriptul în Scriptable).
  tapUrl: null,
};

// ---------------------------------------------------------------------------
// API Info TB (info.stb.ro)
// ---------------------------------------------------------------------------
const BASE_URL = "https://info.stb.ro/api/web/v2-6";
// Cheia publică a clientului web Info TB (aceeași pentru toți utilizatorii).
const APP_KEY = "gcALgRyZHC,qFonZ=Jde";
const STORE_PREFIX = "infotb-widget.";
const ARRIVAL_NOW_SECONDS = 45;

function storeGet(key) {
  const k = STORE_PREFIX + key;
  return Keychain.contains(k) ? Keychain.get(k) : null;
}

function storeSet(key, value) {
  Keychain.set(STORE_PREFIX + key, value);
}

function storeRemove(key) {
  const k = STORE_PREFIX + key;
  if (Keychain.contains(k)) Keychain.remove(k);
}

function storeGetJSON(key) {
  try {
    const raw = storeGet(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function appId() {
  let id = storeGet("appId");
  if (!id) {
    id = UUID.string().toLowerCase();
    storeSet("appId", id);
  }
  return id;
}

function deviceHeaders() {
  return {
    "App-Id": appId(),
    "OS-Type": "Web",
    "App-Version": "2.6.0",
    "Device-Name": "Scriptable",
    "OS-Version": "iOS",
    Lang: "ro",
    Source: "ro.radcom.smartcity.web",
  };
}

async function userInfo() {
  const cached = storeGet("userInfo");
  if (cached) return cached;
  const req = new Request(BASE_URL + "/proxy/user/auth");
  req.headers = Object.assign(deviceHeaders(), { "App-key": APP_KEY, "Content-Type": "application/json" });
  req.timeoutInterval = 15;
  const data = await req.load();
  const status = req.response.statusCode;
  if (status < 200 || status >= 300) throw new Error("Autentificare Info TB eșuată (HTTP " + status + ")");
  const json = JSON.parse(data.toRawString());
  const token = json && json.data && json.data.userInfo;
  if (!token) throw new Error("Răspuns de autentificare fără userInfo");
  storeSet("userInfo", token);
  return token;
}

// Întoarce Data (binary=true) sau JSON. Reîncearcă o dată dacă tokenul a expirat.
async function api(path, binary, retried) {
  const req = new Request(BASE_URL + path);
  req.headers = Object.assign(deviceHeaders(), {
    "User-Info": await userInfo(),
    Accept: binary ? "application/octet-stream" : "application/json",
  });
  req.timeoutInterval = 15;
  const data = await req.load();
  const status = req.response.statusCode;
  if ((status === 401 || status === 412) && !retried) {
    storeRemove("userInfo");
    return api(path, binary, true);
  }
  if (status < 200 || status >= 300) throw new Error("HTTP " + status + " la " + path.split("?")[0]);
  if (binary) return new Uint8Array(data.getBytes());
  return JSON.parse(data.toRawString());
}

// ---------------------------------------------------------------------------
// Decodor Protobuf minimal (unele endpoint-uri Info TB răspund în protobuf)
// ---------------------------------------------------------------------------
function pbDecode(bytes, start, end) {
  const fields = {};
  let p = start || 0;
  const stop = end == null ? bytes.length : end;
  function varint() {
    let result = 0n;
    let shift = 0n;
    let b;
    do {
      if (p >= stop) throw new Error("protobuf trunchiat");
      b = bytes[p++];
      result |= BigInt(b & 0x7f) << shift;
      shift += 7n;
    } while (b & 0x80);
    return result;
  }
  while (p < stop) {
    const key = Number(varint());
    const no = key >>> 3;
    const wire = key & 7;
    let value;
    if (wire === 0) {
      value = varint();
    } else if (wire === 1) {
      value = { at: p, wire: 1 };
      p += 8;
    } else if (wire === 2) {
      const len = Number(varint());
      value = { at: p, end: p + len, wire: 2 };
      p += len;
    } else if (wire === 5) {
      value = { at: p, wire: 5 };
      p += 4;
    } else {
      throw new Error("tip protobuf necunoscut: " + wire);
    }
    if (!fields[no]) fields[no] = [];
    fields[no].push(value);
  }
  return fields;
}

function utf8(bytes, s, e) {
  let out = "";
  let i = s;
  while (i < e) {
    const c = bytes[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if (c < 0xe0) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
    } else if (c < 0xf0) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f));
    } else {
      const cp = ((c & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

// Mic „cititor" pentru un mesaj decodat.
function pbMessage(bytes, start, end) {
  const f = pbDecode(bytes, start, end);
  const first = (no) => (f[no] ? f[no][0] : undefined);
  return {
    has: (no) => !!f[no],
    str: (no) => {
      const v = first(no);
      return v && v.wire === 2 ? utf8(bytes, v.at, v.end) : null;
    },
    int: (no) => {
      const v = first(no);
      return typeof v === "bigint" ? Number(BigInt.asIntN(64, v)) : null;
    },
    bool: (no) => {
      const v = first(no);
      return typeof v === "bigint" ? v !== 0n : null;
    },
    msgs: (no) => (f[no] || []).filter((v) => v && v.wire === 2).map((v) => pbMessage(bytes, v.at, v.end)),
  };
}

// ---------------------------------------------------------------------------
// Găsirea stației, liniei și sensului
// ---------------------------------------------------------------------------
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function sameName(a, b) {
  const x = norm(a);
  const y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

function configKey() {
  return [CONFIG.line, CONFIG.stopName, CONFIG.directionName, CONFIG.stopId, CONFIG.direction].join("|");
}

// Metoda 1: lista tuturor liniilor → traseul liniei pe fiecare sens → stația.
async function resolveFromLine() {
  const lines = pbMessage(await api("/lines?lang=ro", true))
    .msgs(1)
    .map((m) => ({ id: m.int(1), name: m.str(2), color: m.str(6) }));
  const line = lines.find((l) => norm(l.name) === norm(CONFIG.line));
  if (!line) throw new Error("Linia " + CONFIG.line + " nu există în Info TB");

  for (const dir of [0, 1]) {
    if (CONFIG.direction != null && CONFIG.direction !== dir) continue;
    const detail = pbMessage(await api("/lines/" + line.id + "/direction/" + dir + "?lang=ro", true));
    const stops = detail.msgs(12).map((m) => ({ id: m.int(1), name: m.str(4) }));
    const dirName =
      (dir === 0 ? detail.str(10) : detail.str(11)) || (stops.length ? stops[stops.length - 1].name : "");
    const lastStop = stops.length ? stops[stops.length - 1].name : "";
    const dirMatches =
      CONFIG.direction === dir || sameName(dirName, CONFIG.directionName) || sameName(lastStop, CONFIG.directionName);
    if (!dirMatches) continue;
    const stop = CONFIG.stopId
      ? stops.find((s) => s.id === Number(CONFIG.stopId)) || { id: Number(CONFIG.stopId), name: CONFIG.stopName }
      : stops.find((s) => sameName(s.name, CONFIG.stopName));
    if (!stop) continue;
    return {
      lineId: line.id,
      lineName: line.name,
      color: line.color || (detail.str(5) || null),
      direction: dir,
      directionName: dirName || CONFIG.directionName,
      stopId: stop.id,
      stopName: stop.name || CONFIG.stopName,
    };
  }
  return null;
}

// Metoda 2: căutare după numele stației → liniile care opresc acolo.
async function resolveFromSearch() {
  let candidates = [];
  if (CONFIG.stopId) {
    candidates = [{ stop_id: Number(CONFIG.stopId), name: CONFIG.stopName }];
  } else {
    const queries = [CONFIG.stopName, CONFIG.stopName.replace(/\./g, ""), CONFIG.stopName.replace(/\./g, " ").trim()];
    const seen = {};
    let failures = 0;
    let lastError = null;
    for (const q of queries) {
      if (q.length < 3) continue;
      try {
        const json = await api("/places?query=" + encodeURIComponent(q), false);
        for (const p of (json && json.places) || []) {
          if (p.stop_id == null || seen[p.stop_id] || !sameName(p.name, CONFIG.stopName)) continue;
          seen[p.stop_id] = true;
          candidates.push(p);
        }
      } catch (e) {
        failures++;
        lastError = e;
        console.log("Căutare „" + q + "” eșuată: " + e.message);
      }
    }
    // Dacă nicio căutare n-a mers, problema e de rețea/server, nu stația.
    if (!candidates.length && failures && lastError) throw lastError;
  }
  for (const c of candidates) {
    const info = await api("/lines/stops/" + c.stop_id + "?lang=ro", false);
    const line = ((info && info.lines) || []).find(
      (l) =>
        norm(l.name) === norm(CONFIG.line) &&
        (CONFIG.direction != null
          ? Number(l.direction) === CONFIG.direction
          : sameName(l.direction_name || l.directionName, CONFIG.directionName))
    );
    if (!line) continue;
    return {
      lineId: line.id,
      lineName: line.name,
      color: line.color || null,
      direction: Number(line.direction),
      directionName: line.direction_name || line.directionName || CONFIG.directionName,
      stopId: c.stop_id,
      stopName: info.name || c.name || CONFIG.stopName,
    };
  }
  return null;
}

async function resolveTarget() {
  const cached = storeGetJSON("target");
  if (cached && cached.key === configKey()) return cached.target;
  let target = null;
  try {
    target = await resolveFromLine();
  } catch (e) {
    console.log("Detectare după linie eșuată: " + e.message);
  }
  if (!target) target = await resolveFromSearch();
  if (!target) {
    throw new Error(
      "Nu am găsit stația " + CONFIG.stopName + " pe linia " + CONFIG.line + " spre " + CONFIG.directionName
    );
  }
  storeSet("target", JSON.stringify({ key: configKey(), target }));
  return target;
}

// ---------------------------------------------------------------------------
// Sosiri
// ---------------------------------------------------------------------------
function toArrivals(list) {
  const now = Date.now();
  return list
    .filter((a) => Number.isFinite(a.seconds) && a.seconds >= 0)
    .map((a) => ({ at: now + a.seconds * 1000, live: !a.scheduled }));
}

function lineMatches(target, id, name, direction) {
  const sameLine = id != null ? Number(id) === Number(target.lineId) : norm(name) === norm(target.lineName);
  return sameLine && (direction == null || Number(direction) === Number(target.direction));
}

// Endpoint-ul pe care aplicația îl interoghează la 30 s (protobuf ResponseStopDTO).
async function arrivalsFromStopDetail(target) {
  const path =
    "/lines/stop?stop_id=" + target.stopId + "&selected_line_id=" + target.lineId + "&direction=" + target.direction + "&lang=ro";
  const stop = pbMessage(await api(path, true));
  const line = stop
    .msgs(10)
    .find((l) => lineMatches(target, l.has(2) ? l.int(2) : null, l.str(1), l.has(8) ? l.int(8) : null));
  if (!line) return [];
  let times = line.msgs(9).map((t) => ({ seconds: t.int(2), scheduled: t.bool(1) === true }));
  if (!times.length && line.has(6)) times = [{ seconds: line.int(6), scheduled: line.bool(7) === true }];
  return toArrivals(times);
}

// Rezervă: detaliile stației în JSON.
async function arrivalsFromStopJSON(target) {
  const info = await api("/lines/stops/" + target.stopId + "?lang=ro", false);
  const line = ((info && info.lines) || []).find((l) => lineMatches(target, l.id, l.name, l.direction));
  if (!line) return [];
  let times = (line.arriving_times || line.arrivingTimes || []).map((t) => ({
    seconds: Number(t.arrivingTime != null ? t.arrivingTime : t.arriving_time),
    scheduled: !!t.timetable,
  }));
  if (!times.length && line.arriving_time != null) {
    times = [{ seconds: Number(line.arriving_time), scheduled: !!line.is_timetable }];
  }
  return toArrivals(times);
}

async function loadData() {
  const target = await resolveTarget();
  let arrivals = [];
  try {
    arrivals = await arrivalsFromStopDetail(target);
  } catch (e) {
    console.log("Sosiri (protobuf) eșuate: " + e.message);
  }
  if (!arrivals.length) arrivals = await arrivalsFromStopJSON(target);
  arrivals.sort((a, b) => a.at - b.at);
  const result = { key: configKey(), target, arrivals: arrivals.slice(0, CONFIG.maxArrivals), fetchedAt: Date.now() };
  storeSet("last", JSON.stringify(result));
  return result;
}

async function getData() {
  try {
    return await loadData();
  } catch (e) {
    console.error(e);
    const last = storeGetJSON("last");
    if (last && last.target && last.key === configKey()) {
      // Datele vechi rămân utile: ascundem doar autobuzele care au trecut deja.
      last.arrivals = (last.arrivals || []).filter((a) => a.at > Date.now() - 60 * 1000);
      last.stale = true;
      last.error = e.message;
      return last;
    }
    return { error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------
const COLORS = {
  bg: Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E")),
  text: Color.dynamic(new Color("#111111"), new Color("#F2F2F7")),
  muted: Color.dynamic(new Color("#6E6E73"), new Color("#98989D")),
  live: Color.dynamic(new Color("#1A8F3C"), new Color("#30D158")),
  warn: Color.dynamic(new Color("#B25000"), new Color("#FF9F0A")),
};

function timeFmt(ms) {
  const df = new DateFormatter();
  df.dateFormat = "HH:mm";
  return df.string(new Date(ms));
}

function minutesUntil(ms) {
  return Math.max(0, Math.round((ms - Date.now()) / 60000));
}

function etaLabel(ms) {
  const sec = (ms - Date.now()) / 1000;
  if (sec < ARRIVAL_NOW_SECONDS) return "acum";
  return minutesUntil(ms) + " min";
}

function lineBadge(parent, data, size) {
  const color = new Color((data.target && data.target.color) || "#1D71B8");
  const badge = parent.addStack();
  badge.backgroundColor = color;
  badge.cornerRadius = 6;
  badge.setPadding(2, 6, 2, 6);
  const t = badge.addText(CONFIG.line);
  t.font = Font.heavySystemFont(size);
  t.textColor = Color.white();
  return badge;
}

function header(w, data, compact) {
  const row = w.addStack();
  row.centerAlignContent();
  lineBadge(row, data, compact ? 13 : 15);
  row.addSpacer(6);
  const dest = row.addText("→ " + ((data.target && data.target.directionName) || CONFIG.directionName));
  dest.font = Font.semiboldSystemFont(compact ? 11 : 13);
  dest.textColor = COLORS.text;
  dest.lineLimit = 1;
  dest.minimumScaleFactor = 0.7;

  w.addSpacer(3);
  const stop = w.addText("Stația " + ((data.target && data.target.stopName) || CONFIG.stopName));
  stop.font = Font.systemFont(compact ? 11 : 12);
  stop.textColor = COLORS.muted;
  stop.lineLimit = 1;
}

function addMainArrival(w, a, small) {
  const sec = (a.at - Date.now()) / 1000;
  if (sec < ARRIVAL_NOW_SECONDS) {
    const t = w.addText("Acum");
    t.font = Font.boldRoundedSystemFont(small ? 30 : 34);
    t.textColor = COLORS.live;
  } else {
    // Data relativă se actualizează singură, chiar dacă iOS reîmprospătează rar widgetul.
    const d = w.addDate(new Date(a.at));
    d.applyRelativeStyle();
    d.font = Font.boldRoundedSystemFont(small ? 24 : 30);
    d.textColor = COLORS.text;
    d.lineLimit = 1;
    d.minimumScaleFactor = 0.6;
  }
  const info = w.addText((a.live ? "● GPS · " : "◷ program · ") + "la " + timeFmt(a.at));
  info.font = Font.mediumSystemFont(small ? 11 : 12);
  info.textColor = a.live ? COLORS.live : COLORS.muted;
}

function footer(w, data) {
  if (!data.fetchedAt) return;
  const t = w.addText(
    (data.stale ? "⚠︎ offline · " : "Actualizat ") + timeFmt(data.fetchedAt)
  );
  t.font = Font.systemFont(9);
  t.textColor = data.stale ? COLORS.warn : COLORS.muted;
}

function errorText(w, msg) {
  const t = w.addText(msg);
  t.font = Font.systemFont(11);
  t.textColor = COLORS.warn;
  t.minimumScaleFactor = 0.7;
}

function buildHomeWidget(data, family) {
  const w = new ListWidget();
  w.backgroundColor = COLORS.bg;
  w.setPadding(12, 14, 12, 14);
  const small = family === "small";
  header(w, data, small);
  w.addSpacer();

  const arrivals = data.arrivals || [];
  if (!data.target) {
    errorText(w, data.error || "Eroare necunoscută");
  } else if (!arrivals.length) {
    const t = w.addText("Nicio sosire anunțată");
    t.font = Font.semiboldSystemFont(small ? 14 : 16);
    t.textColor = COLORS.muted;
  } else if (small) {
    addMainArrival(w, arrivals[0], true);
    if (arrivals.length > 1) {
      w.addSpacer(3);
      const next = w.addText("apoi " + arrivals.slice(1).map((a) => timeFmt(a.at)).join(", "));
      next.font = Font.systemFont(11);
      next.textColor = COLORS.muted;
      next.lineLimit = 1;
      next.minimumScaleFactor = 0.7;
    }
  } else {
    const row = w.addStack();
    row.bottomAlignContent();
    const left = row.addStack();
    left.layoutVertically();
    addMainArrival(left, arrivals[0], false);
    row.addSpacer();
    const right = row.addStack();
    right.layoutVertically();
    for (const a of arrivals.slice(1)) {
      const line = right.addStack();
      line.centerAlignContent();
      const eta = line.addText(etaLabel(a.at));
      eta.font = Font.semiboldRoundedSystemFont(15);
      eta.textColor = COLORS.text;
      line.addSpacer(6);
      const at = line.addText((a.live ? "● " : "◷ ") + timeFmt(a.at));
      at.font = Font.systemFont(11);
      at.textColor = a.live ? COLORS.live : COLORS.muted;
      right.addSpacer(3);
    }
  }

  w.addSpacer();
  footer(w, data);
  return w;
}

function buildAccessoryWidget(data, family) {
  const w = new ListWidget();
  const a = (data.arrivals || [])[0];
  if (family === "accessoryInline") {
    w.addText("🚌 " + CONFIG.line + ": " + (a ? etaLabel(a.at) : "–"));
    return w;
  }
  if (family === "accessoryCircular") {
    w.addSpacer();
    const l = w.addText(CONFIG.line);
    l.font = Font.boldSystemFont(11);
    l.centerAlignText();
    const v = w.addText(a ? (etaLabel(a.at) === "acum" ? "acum" : String(minutesUntil(a.at))) : "–");
    v.font = Font.boldRoundedSystemFont(20);
    v.centerAlignText();
    if (a && etaLabel(a.at) !== "acum") {
      const m = w.addText("min");
      m.font = Font.systemFont(9);
      m.centerAlignText();
    }
    w.addSpacer();
    return w;
  }
  // accessoryRectangular
  const title = w.addText("🚌 " + CONFIG.line + " → " + ((data.target && data.target.directionName) || CONFIG.directionName));
  title.font = Font.semiboldSystemFont(12);
  title.lineLimit = 1;
  const stop = w.addText((data.target && data.target.stopName) || CONFIG.stopName);
  stop.font = Font.systemFont(11);
  stop.lineLimit = 1;
  const times = (data.arrivals || []).map((x) => etaLabel(x.at));
  const t = w.addText(times.length ? times.join(" · ") : data.target ? "Nicio sosire" : "Eroare");
  t.font = Font.boldRoundedSystemFont(14);
  t.lineLimit = 1;
  return w;
}

function buildWidget(data, family) {
  const w = String(family || "").startsWith("accessory") ? buildAccessoryWidget(data, family) : buildHomeWidget(data, family);
  // Cerem o reîmprospătare cât mai des; iOS decide intervalul real (de obicei 5–15 min).
  w.refreshAfterDate = new Date(Date.now() + 60 * 1000);
  if (CONFIG.tapUrl) w.url = CONFIG.tapUrl;
  return w;
}

// ---------------------------------------------------------------------------
// Pornire
// ---------------------------------------------------------------------------
async function runInApp() {
  const menu = new Alert();
  menu.title = "Linia " + CONFIG.line + " · " + CONFIG.stopName;
  menu.message = "Spre " + CONFIG.directionName;
  menu.addAction("Previzualizare mică");
  menu.addAction("Previzualizare medie");
  menu.addAction("Resetează (redetectează stația)");
  menu.addCancelAction("Închide");
  const choice = await menu.presentSheet();
  if (choice === -1) return;
  if (choice === 2) {
    ["target", "last", "userInfo"].forEach(storeRemove);
    const ok = new Alert();
    ok.title = "Gata";
    ok.message = "Stația va fi detectată din nou la următoarea rulare.";
    ok.addAction("OK");
    await ok.present();
    return;
  }
  const data = await getData();
  console.log(JSON.stringify(data, null, 2));
  const widget = buildWidget(data, choice === 0 ? "small" : "medium");
  if (choice === 0) await widget.presentSmall();
  else await widget.presentMedium();
}

if (config.runsInWidget) {
  const data = await getData();
  Script.setWidget(buildWidget(data, config.widgetFamily));
} else {
  await runInApp();
}
Script.complete();
