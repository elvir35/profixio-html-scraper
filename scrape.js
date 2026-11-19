import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { writeFile, rename, rm } from 'node:fs/promises';
import { parseMatches, mergeMatches } from './match-parser.js';

const BASE = 'https://h43lund.web.sportadmin.se/match/?ID=331249';

// Test the complete replacement path without launching a browser.
export async function synchronize(fetchPage, destination = 'matches.json') {
  const records = [];
  for (const [query, status] of [['kommande', 'upcoming'], ['spelade', 'played']]) {
    records.push(...parseMatches(await fetchPage(`${BASE}&${query}=1`), status));
  }
  const matches = mergeMatches(records);
  const output = {
    scrapedAt: new Date().toISOString(), source: BASE,
    matchCount: matches.length, hasMatches: matches.length > 0,
    message: 'Matches retrieved successfully', matches
  };
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(output, null, 2), 'utf8');
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return output;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const output = await synchronize(async url => {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response?.ok()) throw new Error(`SportAdmin HTTP ${response?.status() ?? 'unavailable'}`);
      await page.locator('.sa-matches').waitFor({ timeout: 10000 });
      return page.content();
    });
    console.log(`Saved ${output.matchCount} validated matches`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Match synchronization failed; previous matches.json retained. Check source markup and HTTP availability.');
    process.exitCode = 1;
  });
}
