#!/usr/bin/env node
// Reads Ölver's own fixture list (sportbarinn.is/boltinn, VS Event List plugin, kept by staff)
// and writes data/fixtures.json. Run by hand or by .github/workflows/fixtures.yml every 30 min.
// The page has no CORS headers, so the browser can't read it directly; this is the bridge.
// Checks: weekday title must match the date, times must be HH:MM, past days are dropped.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = 'https://sportbarinn.is/boltinn/';
const OUT = fileURLToPath(new URL('../data/fixtures.json', import.meta.url));
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  maí: 5, okt: 10, des: 12, jún: 6, júl: 7, ágú: 8 };
const DAYS = ['sunnudagur', 'mánudagur', 'þriðjudagur', 'miðvikudagur', 'fimmtudagur', 'föstudagur', 'laugardagur'];
const SPORT = c => /karf|körf/i.test(c) ? 'Körfubolti' : /handb/i.test(c) ? 'Handbolti' : /\bf1\b|formúl/i.test(c) ? 'Formúla 1'
  : /ufc|mma|box/i.test(c) ? 'Bardagaíþróttir' : /píl|darts/i.test(c) ? 'Píla' : 'Fótbolti';
const COMP = c => /^karfa$/i.test(c) ? 'Körfubolti' : c;

const decode = s => s.replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&amp;/g, '&')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, '');

const res = await fetch(SRC, { headers: { 'user-agent': 'olver-preview-fixtures/1.0 (+sndrstudio.is)' } });
if (!res.ok) throw new Error(`fetch ${res.status}`);
const html = await res.text();

const warnings = [];
const today = new Date().toISOString().slice(0, 10);          // Reykjavík = UTC all year
const blocks = html.split(/<div id="event-\d+" class="vsel-content/).slice(1);
const days = [];
for (const b of blocks) {
  const title = decode((b.match(/vsel-meta-title">([^<]+)</) || [])[1] || '').trim();
  const mon = (b.match(/vsel-month[^>]*>([^<]+)</) || [])[1];
  const day = (b.match(/vsel-day">(\d+)</) || [])[1];
  const year = (b.match(/vsel-year">(\d+)</) || [])[1];
  const m = mon && MONTHS[mon.trim().toLowerCase().slice(0, 3)];
  if (!m || !day || !year) { warnings.push(`no date on "${title}"`); continue; }
  const date = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const wd = DAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
  if (title && title.toLowerCase() !== wd) warnings.push(`${date}: titled "${title}" but the date is a ${wd}`);
  if (date < today) continue;
  const text = decode(((b.match(/vsel-text">([\s\S]*?)<\/div>/) || [])[1] || '').replace(/<br\s*\/?>/g, '\n'));
  const matches = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^[\s•·*-]+/, '').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const t = line.match(/^(\d{1,2})[:.](\d{2})\s+(.*)$/);
    if (!t || +t[1] > 23) { warnings.push(`${date}: skipped "${line}"`); continue; }
    const parts = t[3].split(/\s+[–—-]\s+/).map(s => s.trim()).filter(Boolean);
    const [home, away, ...rest] = parts;
    const comp = COMP(rest.join(' – '));
    matches.push({ time: `${t[1].padStart(2, '0')}:${t[2]}`, home, away: away || '', comp, sport: SPORT(comp) });
  }
  matches.sort((a, b) => a.time.localeCompare(b.time));
  if (matches.length) days.push({ date, matches });
}
days.sort((a, b) => a.date.localeCompare(b.date));

const out = { source: SRC, fetchedAt: new Date().toISOString(), days, warnings };
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null;
const same = prev && JSON.stringify(prev.days) === JSON.stringify(days) && JSON.stringify(prev.warnings) === JSON.stringify(warnings);
if (!same) writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`${days.length} days, ${days.reduce((n, d) => n + d.matches.length, 0)} matches, ${warnings.length} warnings${same ? ' (unchanged)' : ''}`);
warnings.forEach(w => console.log('  ! ' + w));
