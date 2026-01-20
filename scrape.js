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

  console.log("Loading page…");
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  /* Try to accept cookie banner if it exists */
  try {
    await page.waitForSelector("button:has-text('Godkänn')", { timeout: 5000 });
    await page.click("button:has-text('Godkänn')");
    console.log("Cookie banner accepted");
  } catch {
    console.log("No cookie banner");
  }

  /* ✅ Robust wait: wait for JS-rendered content */
  console.log("Waiting for matches to render…");
  await page.waitForFunction(
    () => {
      // Primary signal: real match elements
      if (document.querySelectorAll("[data-match-id]").length > 0) {
        return true;
      }

      // Fallback signals: schedule containers
      return (
        document.querySelector("[class*='match']") ||
        document.querySelector("table")
      );
    },
    { timeout: 25000 }
  );

  /* Debug count */
  const matchCount = await page.evaluate(
    () => document.querySelectorAll("[data-match-id]").length
  );

  if (matchCount === 0) {
    const html = await page.content();
    fs.writeFileSync("debug.html", html);
    throw new Error(
      "No matches found. debug.html has been saved for inspection."
    );
  }

  console.log(`Found ${matchCount} matches`);

  /* Extract data from DOM snapshot */
  const matches = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-match-id]")).map(el => {
      const root = el.closest("div");

      const homeScore = root?.querySelector(".home-score")?.innerText;
      const awayScore = root?.querySelector(".away-score")?.innerText;

      return {
        id: el.dataset.matchId,
        date: root?.querySelector(".match-date")?.innerText ?? null,
        time: root?.querySelector(".match-time")?.innerText ?? null,
        homeTeam: root?.querySelector(".home-team")?.innerText ?? null,
        awayTeam: root?.querySelector(".away-team")?.innerText ?? null,
        venue:
          root?.querySelector(".arena, .hall, .match-location")?.innerText ??
          null,
        score:
          homeScore && awayScore ? `${homeScore} - ${awayScore}` : null
      };
    });
  });

  await browser.close();

  const output = {
    scrapedAt: new Date().toISOString(),
    source: URL,
    matches
  };

  fs.writeFileSync("matches.json", JSON.stringify(output, null, 2));

  console.log("Scraping completed successfully");
  console.log(`Saved ${matches.length} matches to matches.json`);
})();
