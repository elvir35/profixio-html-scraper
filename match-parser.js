import { load } from 'cheerio';

const clean = value => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
const months = ['JANUARI', 'FEBRUARI', 'MARS', 'APRIL', 'MAJ', 'JUNI',
  'JULI', 'AUGUSTI', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DECEMBER'];
const weekdays = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];

export function normalizeTeam(label) {
  const name = clean(label);
  const youth = /^(Flickor|Pojkar) (\d{1,2}) - Födda \d{4}$/u.exec(name);
  return youth ? `${youth[1] === 'Flickor' ? 'F' : 'P'}${youth[2]}` : name;
}

// Unknown empty/error markup must never erase the last valid snapshot.
export function parseMatches(html, status) {
  if (!['upcoming', 'played'].includes(status)) throw new Error('Invalid match status');
  const $ = load(html);
  const root = $('.sa-matches');
  if (root.length !== 1 || root.find('.sa-matches__heading').length !== 1) {
    throw new Error('Expected SportAdmin matches section missing');
  }
  const rows = root.find('.sa-matches__row');
  if (!rows.length) throw new Error('No match cards: empty season or changed markup requires review');
  if (rows.length > 5000) throw new Error('Unexpected match count');
  const records = [];
  let month = '';
  root.find('.sa-matches__month, .sa-matches__row').each((_, element) => {
    const row = $(element);
    if (row.hasClass('sa-matches__month')) {
      month = clean(row.text()).toUpperCase();
      return;
    }
    const text = selector => {
      const node = row.find(selector);
      if (node.length !== 1) throw new Error(`Incomplete match card: ${selector}`);
      return clean(node.text());
    };
    const monthMatch = /^([A-ZÅÄÖ]+) (\d{4})$/u.exec(month);
    const monthIndex = monthMatch ? months.indexOf(monthMatch[1]) : -1;
    const dayText = text('.sa-matches__day');
    const rawWeekday = text('.sa-matches__weekday').toLowerCase();
    const weekday = rawWeekday === 'tors' ? 'tor' : rawWeekday;
    const day = Number(dayText);
    const year = Number(monthMatch?.[2]);
    const instant = new Date(Date.UTC(year, monthIndex, day));
    if (monthIndex < 0 || !/^\d{1,2}$/.test(dayText) || year < 2000 || year > 2100 ||
        instant.getUTCMonth() !== monthIndex || instant.getUTCDate() !== day ||
        weekdays[instant.getUTCDay()] !== weekday) throw new Error('Invalid match date');
    const time = text('.sa-matches__time');
    if (time && time !== '–' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new Error('Invalid match time');
    }
    const teams = row.find('.sa-matches__team');
    if (teams.length !== 2) throw new Error('Expected two match participants');
    const names = teams.map((_, node) => {
      const name = $(node).find('.sa-matches__team-name');
      if (name.length !== 1 || !clean(name.text())) throw new Error('Missing participant');
      return clean(name.text());
    }).get();
    const ids = teams.map((_, node) => {
      const url = new URL($(node).attr('href'), 'https://h43lund.web.sportadmin.se');
      return url.searchParams.get('AID') || '';
    }).get();
    if (!/^\d+$/.test(ids[0]) || ids[0] !== ids[1]) throw new Error('Invalid match identifier');
    const group = text('.sa-matches__group-link');
    if (!group) throw new Error('Missing team group');
    const rawScore = text('.sa-matches__score');
    const scoreMatch = /^(\d{1,3})\s*[-–:]\s*(\d{1,3})$/.exec(rawScore);
    const unknownScore = /^[-–—](?:\s*-\s*[-–—])?$/.test(rawScore);
    if (rawScore && !scoreMatch && !unknownScore) throw new Error('Invalid match score');
    const logos = teams.toArray().map(node => {
      const source = $(node).find('.sa-matches__team-logo').attr('src');
      if (!source) return '';
      const url = new URL(source, 'https://h43lund.web.sportadmin.se');
      if (url.protocol !== 'https:') throw new Error('Invalid logo URL');
      return url.href;
    });
    records.push({
      eventId: ids[0], team: normalizeTeam(group),
      hall: clean(row.find('.sa-matches__place').text()),
      time: time === '–' ? '' : time, date: `${weekday} ${day}`, month,
      home: names[0], away: names[1],
      score: scoreMatch ? `${scoreMatch[1]} - ${scoreMatch[2]}` : '',
      // Keep the legacy home-side field for existing API consumers.
      logo: logos[0], homeLogo: logos[0], awayLogo: logos[1], status
    });
  });
  return records;
}

export function mergeMatches(records) {
  const unique = new Map();
  for (const record of records) {
    const key = `${record.team}:${record.eventId}`;
    const previous = unique.get(key);
    if (previous?.status === record.status && JSON.stringify(previous) !== JSON.stringify(record)) {
      throw new Error('Conflicting duplicate match');
    }
    if (!previous || record.status === 'played') unique.set(key, record);
  }
  return [...unique.values()].map(({ eventId, ...publicRecord }) => publicRecord);
}
