/**
 * scripts/lib/hours.mjs
 *
 * Parses a useful subset of OSM `opening_hours` into:
 *   - spec:  machine DayHours[] (dow follows JS getDay: 0=Sun..6=Sat) for "open now"
 *   - human: OpeningHours[] (Swedish day labels) for display
 *
 * Handles: "24/7", "Mo-Fr 09:00-20:00; Sa,Su 10:00-18:00",
 * multi-range times ("09:00-12:00,13:00-18:00"), and "off"/"closed".
 * Anything more exotic (PH, month ranges, comments) is skipped gracefully.
 */

const OSM_DOW = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0 };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SV_DAY = { 1: "Mån", 2: "Tis", 3: "Ons", 4: "Tor", 5: "Fre", 6: "Lör", 0: "Sön" };

function expandDays(dayPart) {
  const days = new Set();
  for (const tok of dayPart.split(",")) {
    const t = tok.trim();
    const range = t.match(/^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$/);
    if (range) {
      const a = OSM_DOW[range[1]];
      const b = OSM_DOW[range[2]];
      if (a == null || b == null) continue;
      const ai = WEEK_ORDER.indexOf(a);
      const bi = WEEK_ORDER.indexOf(b);
      if (ai === -1 || bi === -1) continue;
      for (let i = ai; ; i = (i + 1) % WEEK_ORDER.length) {
        days.add(WEEK_ORDER[i]);
        if (i === bi) break;
      }
    } else if (OSM_DOW[t] != null) {
      days.add(OSM_DOW[t]);
    }
  }
  return [...days];
}

function parseTimes(timePart) {
  if (/off|closed/i.test(timePart)) return [];
  const out = [];
  for (const seg of timePart.split(",")) {
    const m = seg.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) continue;
    out.push({ open: m[1].padStart(5, "0"), close: m[2].padStart(5, "0") });
  }
  return out;
}

function humanize(spec) {
  // group days that share the exact same set of time ranges
  const byDay = new Map();
  for (const e of spec) {
    if (!byDay.has(e.dow)) byDay.set(e.dow, []);
    byDay.get(e.dow).push(`${e.open}-${e.close}`);
  }
  const sig = (d) => (byDay.get(d) ?? []).slice().sort().join(",");
  const groups = [];
  let run = [];
  for (const d of WEEK_ORDER) {
    if (!byDay.has(d)) {
      if (run.length) {
        groups.push(run);
        run = [];
      }
      continue;
    }
    if (run.length && sig(run[run.length - 1]) === sig(d)) run.push(d);
    else {
      if (run.length) groups.push(run);
      run = [d];
    }
  }
  if (run.length) groups.push(run);

  return groups.map((g) => {
    const label = g.length === 1 ? SV_DAY[g[0]] : `${SV_DAY[g[0]]}-${SV_DAY[g[g.length - 1]]}`;
    const hours = (byDay.get(g[0]) ?? []).join(", ");
    return { days: label, hours };
  });
}

export function parseOsmHours(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  if (/24\s*\/\s*7/.test(s)) {
    return {
      spec: WEEK_ORDER.map((d) => ({ dow: d, open: "00:00", close: "24:00" })),
      human: [{ days: "Alla dagar", hours: "Dygnet runt" }],
    };
  }
  const spec = [];
  for (const ruleRaw of s.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    const m = rule.match(/^([A-Za-z,\s-]+?)\s+(\d{1,2}:\d{2}.*)$/);
    if (!m) continue;
    const days = expandDays(m[1].trim());
    const times = parseTimes(m[2].trim());
    for (const d of days) for (const t of times) spec.push({ dow: d, open: t.open, close: t.close });
  }
  if (spec.length === 0) return null;
  return { spec, human: humanize(spec) };
}

/** Convert a DataForSEO work_hours.timetable object into the same shape. */
export function parseDfsHours(work) {
  const tt = work?.timetable;
  if (!tt || typeof tt !== "object") return null;
  const map = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const spec = [];
  for (const [day, ranges] of Object.entries(tt)) {
    const dow = map[day.toLowerCase()];
    if (dow == null || !Array.isArray(ranges)) continue;
    for (const r of ranges) {
      if (!r?.open || !r?.close) continue;
      const fmt = (x) => `${String(x.hour).padStart(2, "0")}:${String(x.minute ?? 0).padStart(2, "0")}`;
      spec.push({ dow, open: fmt(r.open), close: fmt(r.close) });
    }
  }
  if (spec.length === 0) return null;
  return { spec, human: humanize(spec) };
}
