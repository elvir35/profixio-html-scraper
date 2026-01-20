import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.profixio.com/app/lx/competition/leagueid17956/teams/1403367?t=schedule";

(async () => {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  console.log("➡️ Loading page");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait until team name exists (reliable signal)
  console.log('⏳ Waiting for text "H43 Lund HF"');
  await page.waitForFunction(
    () => document.body.innerText.includes("H43 Lund HF"),
    { timeout: 25000 }
  );

  console.log("📖 Reading page text");

  const matches = await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const results = [];

    // Example date: "Monday Jan 26, 2026"
    const dateRegex = /^[A-Za-z]+ [A-Za-z]+ \d{1,2}, \d{4}$/;
    const timeRegex = /^\d{1,2}:\d{2}$/;

    for (let i = 0; i < lines.length; i++) {
      if (!dateRegex.test(lines[i])) continue;

      const date = lines[i];
      const round = lines[i + 1];        // "Runde 18"
      const venue = lines[i + 3];        // after "•"

      const teamA = lines[i + 4];
      const time = timeRegex.test(lines[i + 5]) ? lines[i + 5] : null;
      const teamB = lines[i + 6];

      if (!teamA || !teamB || !time) continue;

      results.push({
        date,
        round,
        time,
        homeTeam: teamA,
        awayTeam: teamB,
        venue
      });
    }

    return results;
  });

  await browser.close();

  if (matches.length === 0) {
    throw new Error("❌ No matches parsed from page text");
  }

  const output = {
    scrapedAt: new Date().toISOString(),
    source: URL,
    matchCount: matches.length,
    matches
  };

  fs.writeFileSync("matches.json", JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ Scraping completed`);
  console.log(`💾 matches.json created with ${matches.length} matches`);
})();
