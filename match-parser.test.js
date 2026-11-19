import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMatches, mergeMatches, normalizeTeam } from './match-parser.js';
import { synchronize } from './scrape.js';

// Synthetic club names and IDs; no scraped personal data in fixtures.
function card({id='101', group='Flickor 14 - Födda 2012', day='14', weekday='lör', score='— -&nbsp;—', time='16:40'}={}) {
 return `<div class="sa-matches__row">
  <span class="sa-matches__day">${day}</span><span class="sa-matches__weekday">${weekday}</span>
  <span class="sa-matches__time">${time}</span>
  <a class="sa-matches__group-link">${group}</a><span class="sa-matches__place">Övningshallen</span>
  <a class="sa-matches__team" href="/kalender/?ID=42&amp;AID=${id}"><img class="sa-matches__team-logo" src="https://cdn.sportadmin.se/test.webp"><span class="sa-matches__team-name">H43 Lund HF 2</span></a>
  <a class="sa-matches__team" href="/kalender/?ID=42&amp;AID=${id}"><img class="sa-matches__team-logo" src="https://cdn.sportadmin.se/test-away.webp"><span class="sa-matches__team-name">Testklubben Blå</span></a>
  <div class="sa-matches__score"><strong>${score}</strong></div></div>`;
}
const page = (body=card()) => `<div class="sa-matches"><h2 class="sa-matches__heading">Matcher</h2><div class="sa-matches__month">NOVEMBER 2026</div>${body}</div>`;

test('modern cards preserve the public feed contract and Swedish text', () => {
 const [{eventId,...row}] = parseMatches(page(), 'upcoming');
 assert.deepEqual(row,{team:'F14',hall:'Övningshallen',time:'16:40',date:'lör 14',month:'NOVEMBER 2026',home:'H43 Lund HF 2',away:'Testklubben Blå',score:'',logo:'https://cdn.sportadmin.se/test.webp',homeLogo:'https://cdn.sportadmin.se/test.webp',awayLogo:'https://cdn.sportadmin.se/test-away.webp',status:'upcoming'});
 assert.equal(eventId,'101');
});
test('youth labels normalize without changing senior/junior groups', () => {
 assert.equal(normalizeTeam('  Pojkar 11 - Födda 2015  '),'P11');
 assert.equal(normalizeTeam('Flickor 9 - Födda 2017'),'F9');
 for(const group of ['Herrar A','Damer A','Pojkar 19/Herrar J','HK BLÅ Dam']) assert.equal(normalizeTeam(group),group);
});
test('month headings and SportAdmin tors abbreviation produce valid dates',()=>{
 const rows=parseMatches(page(card({day:'19',weekday:'tors'})+'<div class="sa-matches__month">DECEMBER 2026</div>'+card({id:'102',day:'5'})), 'upcoming');
 assert.equal(rows[0].date,'tor 19');
 assert.equal(rows[1].month,'DECEMBER 2026');
});
test('played score is extracted in home-away order; unreported results stay empty',()=>{
 assert.equal(parseMatches(page(card({score:'26 – 23'})),'played')[0].score,'26 - 23');
 assert.equal(parseMatches(page(),'played')[0].score,'');
});
test('source status is retained, not inferred from date alone',()=>{
 assert.equal(parseMatches(page(),'upcoming')[0].status,'upcoming');
});
test('duplicate cards and overlap merge by event AND team; played wins in either order',()=>{
 const upcoming=parseMatches(page(),'upcoming');
 const played=parseMatches(page(card({score:'26 - 23'})),'played');
 for(const input of [[...upcoming,...upcoming,...played],[...played,...upcoming]]){
  const merged=mergeMatches(input);assert.equal(merged.length,1);assert.equal(merged[0].status,'played');assert.equal(merged[0].score,'26 - 23');assert.equal('eventId' in merged[0],false);
 }
 assert.equal(mergeMatches([...upcoming,...parseMatches(page(card({group:'Pojkar 11 - Födda 2015'})),'upcoming')]).length,2);
});
for(const [label,html] of [
 ['missing root','<p>Temporarily unavailable</p>'],
 ['changed structure',page(card().replaceAll('sa-matches__team-name','new-name'))],
 ['unverified empty',page('')],
 ['truncated card',page(card().replace('<span class="sa-matches__day">14</span>',''))],
 ['invalid date',page(card({day:'31'}))],
 ['weekday mismatch',page(card({weekday:'fre'}))],
 ['invalid time',page(card({time:'25:61'}))],
 ['malformed score',page(card({score:'26 - error'}))],
 ['mismatched identifiers',page(card().replace('AID=101','AID=102'))]
]) test(`rejects ${label}`,()=>assert.throws(()=>parseMatches(html,'upcoming')));

for(const failure of ['http','empty','incomplete']) test(`retains previous snapshot when second source fails: ${failure}`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'h43-matches-')); const target=join(dir,'matches.json');
 try {
  const original='{"matches":[{"retained":true}]}';await writeFile(target,original);
  await assert.rejects(synchronize(async url=>{
   if(url.includes('kommande='))return page();
   if(failure==='http')throw new Error('HTTP 503');
   return failure==='empty'?page(''):'<html>Unavailable</html>';
  },target));
  assert.equal(await readFile(target,'utf8'),original);
  assert.deepEqual(await readdir(dir),['matches.json']);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('successful synchronization replaces complete snapshot with consistent count and public fields',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'h43-matches-')); const target=join(dir,'matches.json');
 try {
  const result=await synchronize(async()=>page(),target);
  assert.equal(result.matchCount,1);assert.equal(result.hasMatches,true);
  assert.equal(result.matches[0].status,'played');
  assert.equal('eventId' in result.matches[0],false);
  assert.deepEqual(JSON.parse(await readFile(target,'utf8')),result);
  assert.deepEqual(await readdir(dir),['matches.json']);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('conflicting duplicate fixtures fail instead of silently discarding a match',()=>{
 const first=parseMatches(page(),'upcoming');
 const second=parseMatches(page(card({time:'17:00'})),'upcoming');
 assert.throws(()=>mergeMatches([...first,...second]),/Conflicting duplicate/);
});

test('missing away shield remains empty without copying the home shield',()=>{
 const html=page().replace('<img class="sa-matches__team-logo" src="https://cdn.sportadmin.se/test-away.webp">','');
 const [row]=parseMatches(html,'upcoming');
 assert.equal(row.homeLogo,'https://cdn.sportadmin.se/test.webp');
 assert.equal(row.awayLogo,'');assert.equal(row.logo,row.homeLogo);
});
test('validates the away shield URL as well as the home shield URL',()=>{
 const html=page().replace('https://cdn.sportadmin.se/test-away.webp','javascript:alert(1)');
 assert.throws(()=>parseMatches(html,'upcoming'),/Invalid logo URL/);
});
