// ===== forexfactory feed → جدول فارسی → عکس (Chrome خود GitHub) → تلگرام =====
// اجرا: node bot.mjs   (توسط GitHub Actions هر ۳۰ دقیقه)
import { chromium } from "playwright-core";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const FONT_R = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Regular.woff2";
const FONT_B = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Bold.woff2";

const env = process.env;
const MODE = env.TZ_MODE || "site";                 // site | tehran
const SITE_TZ = env.SITE_TZ || "Asia/Dubai";
const NUM_FA = env.NUM_FA !== "0";
const TMAP_FILE = "tmap.json";                      // کش ترجمه (با actions/cache نگه داشته می‌شود)

const log = (tag, ...a) => console.log(`[${tag}]`, ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const V = x => (x == null || x === "" ? "—" : esc(x));
const faDigits = s => String(s).replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);
const hostOf = u => { try { return new URL(u).hostname; } catch { return String(u).slice(0, 30); } };

const DICT = {
  "Monetary Policy Meeting Minutes": "صورت‌جلسه نشست سیاست پولی",
  "SPPI": "شاخص قیمت خدمات تولیدکنندگان",
  "BRC Shop Price Index": "شاخص قیمت خرده‌فروشی BRC",
  "Household Spending": "هزینه‌های مصرفی خانوار",
  "Bank Holiday": "تعطیلی بانکی",
};
const NAMES = {
  ramsden: "رامسدن", bowman: "بوومن", cook: "کوک", barkin: "بارکین", lagarde: "لاگارد",
  bailey: "بیلی", powell: "پاول", waller: "والر", williams: "ویلیامز", schmid: "اشمید",
  hammack: "هاماک", goolsbee: "گولزبی", jefferson: "جفرسون", kugler: "کاگلر", logan: "لوگان",
  collins: "کالینز", musalem: "موصلیم", bostic: "بوستیک", daly: "دیلی", harker: "هارکر",
  kashkari: "کاشکاری", ueda: "اوئدا", schnabel: "شنابل", lane: "لین", maki: "ماکی", himino: "هیمینو",
};
const nm = s => NAMES[s.toLowerCase()] || s;
const SPEAK = [
  [/^MPC member (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، عضو کمیته سیاست پولی (MPC)`],
  [/^FOMC member (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، عضو کمیته بازار باز فدرال‌رزرو (FOMC)`],
  [/^ECB president (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، رئیس بانک مرکزی اروپا (ECB)`],
  [/^ECB member (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، عضو بانک مرکزی اروپا`],
  [/^BOE gov (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، رئیس بانک انگلستان`],
  [/^BOE member (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، عضو بانک انگلستان`],
  [/^BOJ (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، بانک ژاپن`],
  [/^Fed chair (.+?) speaks$/i, n => `سخنرانی ${nm(n)}، رئیس فدرال‌رزرو`],
  [/^President (.+?) speaks$/i, n => `سخنرانی رئیس‌جمهور ${nm(n)}`],
  [/^(.+?) speaks$/i, n => `سخنرانی ${nm(n)}`],
];
const SUF = { "y/y": "س/س", "m/m": "م/م", "q/q": "ف/ف", "w/w": "ه/ه" };
const IMPACT = { High: "hi", Medium: "me", Low: "lo", Holiday: "ho" };

function fmts(tz) {
  return {
    day: new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }),
    timeStr: ts => new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ts),
    head: new Intl.DateTimeFormat("fa-IR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }),
    sub: new Intl.DateTimeFormat("fa-IR", { timeZone: tz, day: "numeric", month: "long" }),
  };
}

// ---------- ترجمه ----------
async function gtx(t) {
  try {
    const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=" + encodeURIComponent(t), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { const d = await r.json(); const o = (d[0] || []).map(x => x[0]).join("").trim(); if (o) return o; }
    else log("TRANS", "google status", r.status);
  } catch (e) { log("TRANS", "google error", e.message); }
  try {
    const r = await fetch("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(t) + "&langpair=en|fa", { signal: AbortSignal.timeout(6000) });
    if (r.ok) { const d = await r.json(); const o = ((d.responseData || {}).translatedText || "").trim(); if (o && !/MYMEMORY WARNING/i.test(o)) return o; }
  } catch (e) { log("TRANS", "mymemory error", e.message); }
  return null;
}
async function faTitle(raw, T) {
  const t = (raw || "").trim();
  if (!t) return "—";
  if (T[t]) return T[t];
  let out = null, m;
  for (const [re, fa] of SPEAK) { if ((m = t.match(re))) { out = fa(m[1]); break; } }
  if (!out) {
    let suf = "", base = t;
    if ((m = t.match(/^(.*?)\s+(y\/y|m\/m|q\/q|w\/w)$/i))) { base = m[1]; suf = SUF[m[2].toLowerCase()]; }
    if (DICT[base]) out = DICT[base] + (suf ? " " + suf : "");
    else {
      if (!T[base]) { const o = await gtx(base); if (o) T[base] = o; }
      out = (T[base] || base) + (suf ? " " + suf : "");
    }
  }
  T[t] = out;
  return out;
}

// ---------- فید ----------
async function fetchFeed() {
  const ff = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
  const sources = [
    "https://cdn-nfs.faireconomy.media/ff_calendar_thisweek.json", ff,
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(ff),
    "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(ff),
    "https://corsproxy.io/?url=" + encodeURIComponent(ff),
  ];
  for (let round = 1; round <= 2; round++) {
    for (const u of sources) {
      const t0 = Date.now();
      try {
        const r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) });
        if (!r.ok) { log("FEED", hostOf(u), "status=" + r.status, (Date.now() - t0) + "ms"); continue; }
        const d = await r.json();
        if (Array.isArray(d) && d.length) { log("FEED", hostOf(u), "OK events=" + d.length); return d; }
        log("FEED", hostOf(u), "empty/invalid json");
      } catch (e) { log("FEED", hostOf(u), "ERROR", e.message); }
    }
    if (round < 2) { log("FEED", "all sources failed, retry in 20s"); await sleep(20000); }
  }
  throw new Error("هیچ منبع فیدی جواب نداد");
}

// ---------- ساخت ردیف‌ها ----------
async function buildSnapshot() {
  const tz = MODE === "tehran" ? "Asia/Tehran" : SITE_TZ;
  const F = fmts(tz);
  const now = new Date();
  const all = await fetchFeed();
  const today = F.day.format(now);
  const evs = all.map(e => ({ ...e, ts: new Date(e.date).getTime() }))
    .filter(e => isFinite(e.ts) && F.day.format(e.ts) === today)
    .sort((a, b) => a.ts - b.ts);
  log("SNAP", "tz=" + tz, "today=" + today, "feed=" + all.length, "todayEvents=" + evs.length);

  let T = {};
  try { T = JSON.parse(fs.readFileSync(TMAP_FILE, "utf8")); } catch {}
  const titles = [...new Set(evs.map(e => (e.title || "").trim()).filter(Boolean))];
  for (let i = 0; i < titles.length; i += 5)
    await Promise.all(titles.slice(i, i + 5).map(t => faTitle(t, T)));
  try { fs.writeFileSync(TMAP_FILE, JSON.stringify(T)); } catch {}

  const fx = s => NUM_FA ? faDigits(s) : s;
  const rows = evs.map(e => {
    const kk = (e.title || "").trim();
    return {
      time: e.impact === "Holiday" ? "تمام روز" : fx(F.timeStr(e.ts)),
      cur: e.country || "",
      cls: IMPACT[e.impact] || "lo",
      title: T[kk] || DICT[kk] || kk || "—",
      actual: e.actual ? fx(e.actual) : "",
      forecast: e.forecast ? fx(e.forecast) : "",
      previous: e.previous ? fx(e.previous) : "",
    };
  });
  const H = Math.max(600, Math.min(220 + rows.length * 62 + 30, 6000));
  return { rows, H, dayFa: F.head.format(now), daySub: F.sub.format(now) };
}

// ---------- فونت و HTML ----------
async function fontB64(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer()).toString("base64");
      log("FONT", "status", r.status);
    } catch (e) { log("FONT", "error", e.message); }
    await sleep(2000);
  }
  throw new Error("دانلود فونت ناموفق بود");
}

function buildHTML(rows, fR, fB, dayFa, daySub) {
  const N = rows.length;
  const rowHtml = rows.map((r, i) => `
<tr>
  ${i === 0 ? `<td class="dt" rowspan="${N}"><b>${esc(dayFa)}</b><span class="ge">${esc(daySub)}</span></td>` : ""}
  <td class="t">${V(r.time)}</td>
  <td class="c"><span dir="ltr">${V(r.cur)}</span></td>
  <td><span class="imp ${r.cls}"></span></td>
  <td class="e">${V(r.title)}</td>
  <td class="n act" dir="ltr">${V(r.actual)}</td>
  <td class="n" dir="ltr">${V(r.forecast)}</td>
  <td class="n" dir="ltr">${V(r.previous)}</td>
</tr>`).join("");
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face{font-family:V;src:url(data:font/woff2;base64,${fR}) format("woff2");font-weight:400}
@font-face{font-family:V;src:url(data:font/woff2;base64,${fB}) format("woff2");font-weight:700}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#fff}
body{display:flex;flex-direction:column;font-family:V,Tahoma,sans-serif;overflow:hidden}
.bar{flex:0 0 auto;background:linear-gradient(#3f5f96,#2e4a78);color:#fff;font-weight:700;font-size:clamp(16px,1.7vw,26px);padding:12px 24px}
.tw{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
th{background:#4867a3;color:#f2f5fb;font-size:clamp(12px,1.3vw,20px);padding:10px 6px;border-left:1px solid #3a5488}
td{font-size:clamp(13px,1.4vw,22px);padding:6px 8px;border-bottom:1px solid #e4e8ef;border-left:1px solid #eef1f6;text-align:center;color:#222;vertical-align:middle}
tr:nth-child(odd) td{background:#f7f9fc}
.dt{background:#fff !important;line-height:1.8}
.dt .ge{display:block;color:#888;font-size:.85em}
.t{color:#555}.c{font-weight:700}
.e{text-align:right;direction:rtl;unicode-bidi:plaintext;padding-left:14px}
.n{color:#333}.act{color:#0a8f3c;font-weight:700}
.imp{display:inline-block;width:clamp(14px,1.5vw,24px);height:clamp(14px,1.5vw,24px);border-radius:6px;vertical-align:middle}
.hi{background:#e03131}.me{background:#f08c00}.lo{background:#fcc419}.ho{background:#adb5bd}
.legend{flex:0 0 auto;display:flex;gap:34px;justify-content:center;padding:8px 0;font-size:clamp(11px,1.15vw,18px);color:#666;background:#fff}
.legend i{display:inline-block;width:.95em;height:.95em;border-radius:4px;margin-left:8px;vertical-align:-2px}
</style></head><body>
<div class="bar">📅 تقویم اقتصادی ${esc(dayFa)} — فارکس‌فکتوری</div>
<div class="tw">
<table>
<colgroup><col style="width:11%"><col style="width:7%"><col style="width:6%"><col style="width:5%"><col><col style="width:10%"><col style="width:10%"><col style="width:10%"></colgroup>
<tr><th>تاریخ</th><th>زمان</th><th>ارز</th><th>تأثیر</th><th>رویداد</th><th>فعلی</th><th>پیش‌بینی</th><th>قبلی</th></tr>
 ${rowHtml}
</table>
</div>
<div class="legend"><span><i class="hi"></i>مهم</span><span><i class="me"></i>متوسط</span><span><i class="lo"></i>کم</span><span><i class="ho"></i>تعطیلی</span></div>
</body></html>`;
}

// ---------- عکس‌گرفتن با Chrome ----------
async function screenshot(snap) {
  const [fR, fB] = await Promise.all([fontB64(FONT_R), fontB64(FONT_B)]);
  const html = buildHTML(snap.rows, fR, fB, snap.dayFa, snap.daySub);
  const browser = await chromium.launch({
    executablePath: env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: snap.H }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(300);
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    log("SHOT", "OK bytes=" + buf.length, "viewport=1600x" + snap.H);
    return buf;
  } finally { await browser.close(); }
}

// ---------- تلگرام ----------
async function sendPhoto(chatId, buf, caption) {
  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("caption", caption);
  fd.append("photo", new Blob([buf], { type: "image/jpeg" }), "calendar.jpg");
  const r = await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendPhoto`, { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  log("TG", "sendPhoto http=" + r.status, "ok=" + j.ok, j.description || "");
  if (!j.ok) throw new Error("تلگرام: " + (j.description || "?"));
}
async function sendText(chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (e) { log("TG", "sendText error", e.message); }
}

// ---------- اجرا ----------
async function main() {
  for (const k of ["TG_TOKEN", "CHAT_ID"]) if (!env[k]) throw new Error(`Secret «${k}» تنظیم نشده است`);

  // اگر workflow کمی زودتر شروع شده (مثلاً ۱ دقیقه قبل از :00 یا :30)، تا لحظه‌ی دقیق صبر می‌کند
  if (env.WAIT_FOR_BOUNDARY === "1") {
    const HALF = 30 * 60 * 1000, now = Date.now(), next = Math.ceil(now / HALF) * HALF, wait = next - now;
    if (wait > 0 && wait <= 6 * 60 * 1000) { log("WAIT", "sleeping " + Math.round(wait / 1000) + "s until " + new Date(next).toISOString()); await sleep(wait); }
    else log("WAIT", "no wait needed (next boundary in " + Math.round(wait / 1000) + "s)");
  }

  const snap = await buildSnapshot();
  if (!snap.rows.length) { log("RUN", "امروز رویدادی نیست؛ چیزی ارسال نشد"); return; }

  const shot = await screenshot(snap);
  await sendPhoto(env.CHAT_ID, shot, "📅 تقویم اقتصادی " + snap.dayFa + " — فارکس‌فکتوری");
  log("RUN", "SENT OK");
}

main().catch(async e => {
  log("ERR", e.stack || e.message);
  if (env.TG_TOKEN && env.ADMIN_CHAT_ID) await sendText(env.ADMIN_CHAT_ID, "❌ خطای ربات تقویم (GitHub): " + e.message);
  process.exit(1);
});
