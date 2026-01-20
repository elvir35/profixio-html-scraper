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

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  /* Accept cookie banner if present */
  try {
    await page.waitForSelector("button:has-text('Godkänn')", { timeout: 5000 });
    await page.click("button:has-text('Godkänn')");
  } catch {
    // no banner
  }

  /* Wait until team name appears (from attached HTML) */
  await page.waitForFunction(
    () => document.body.innerText.includes("H43 Lund HF"),
    { timeout: 25000 }
  );

  /* Ensure matches exist */
  const matchCount = await page.evaluate(
    () => document.querySelectorAll("[data-match-id]").length
  );

  if (matchCount === 0) {
    fs.writeFileSync("debug.html", await page.content());
    throw new Error("No match blocks found. debug.html saved.");
  }

  /* 🔥 Extract using selectors VERIFIED in the HTML */
  const matches = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-match-id]")).map(el => {
      // Each match-id element sits inside the match container
      const container = el.closest("div");

      const text = sel =>
        container?.querySelector(sel)?.innerText.trim() ?? null;

      const homeScore = text(".home-score");
      const awayScore = text(".away-score");

      return {
        id: el.dataset.matchId,
        date: text(".match-date"),
        time: text(".match-time"),
        homeTeam: text(".home-team"),
        awayTeam: text(".away-team"),
        venue: text(".arena, .hall, .match-location"),
        score:
          homeScore && awayScore ? `${homeScore} - ${awayScore}` : null
      };
    });
  });

  await browser.close();

  fs.writeFileSync(
    "matches.json",
    JSON.stringify(
      {
        scrapedAt: new Date().toISOString(),
        source: URL,
        matchCount: matches.length,
        matches
      },
      null,
      2
    )
  );

  console.log(`✅ Scraped ${matches.length} matches`);
})();
