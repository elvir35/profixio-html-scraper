import { chromium } from "playwright";

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

  // Wait until team name exists (your proven reliable signal)
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

    // Example date line: "Monday Jan 26, 2026"
    const dateRegex = /^[A-Za-z]+ [A-Za-z]+ \d{1,2}, \d{4}$/;
    const timeRegex = /^\d{1,2}:\d{2}$/;

    for (let i = 0; i < lines.length; i++) {
      if (!dateRegex.test(lines[i])) continue;

      const date = lines[i];
      const round = lines[i + 1]; // "Runde 18"
      const venue = lines[i + 3]; // after "•"

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

  console.log(`📊 Extracted ${matches.length} matches`);
  console.log(JSON.stringify(matches.slice(0, 3), null, 2));

  if (matches.length === 0) {
    throw new Error("❌ No matches parsed from text");
  }

  console.log("✅ Scraping completed successfully");
})();
