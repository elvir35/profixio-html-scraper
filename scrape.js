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

  /* Cookie banner (if any) */
  try {
    await page.waitForSelector("button:has-text('Godkänn')", { timeout: 5000 });
    await page.click("button:has-text('Godkänn')");
    console.log("🍪 Cookie banner accepted");
  } catch {
    console.log("🍪 No cookie banner");
  }

  /* Wait until team name is visible somewhere */
  console.log('⏳ Waiting for text "H43 Lund HF"');
  await page.waitForFunction(
    () => document.body.innerText.includes("H43 Lund HF"),
    { timeout: 25000 }
  );

  /* 🔍 DEBUG: inspect DOM at runtime */
  const debugInfo = await page.evaluate(() => {
    return {
      bodyTextSample: document.body.innerText.slice(0, 800),
      matchClassCount: document.querySelectorAll("[class*='match']").length,
      homeTeamCount: document.querySelectorAll(".home-team").length,
      awayTeamCount: document.querySelectorAll(".away-team").length,
      scoreCount: document.querySelectorAll(".home-score, .away-score").length,
      allDivCount: document.querySelectorAll("div").length
    };
  });

  console.log("🔎 DEBUG DOM INFO:");
  console.log(JSON.stringify(debugInfo, null, 2));

  /* Extract matches (structure-based, no data-match-id dependency) */
  const matches = await page.evaluate(() => {
    const results = [];

    const teamNodes = Array.from(document.querySelectorAll("div, span"))
      .filter(el => el.innerText?.includes("H43 Lund HF"));

    teamNodes.forEach(node => {
      const container =
        node.closest("div[class*='match']") ||
        node.closest("div") ||
        node.parentElement;

      if (!container) return;

      const text = sel =>
        container.querySelector(sel)?.innerText.trim() ?? null;

      const homeScore = text(".home-score");
      const awayScore = text(".away-score");

      const match = {
        date: text(".match-date"),
        time: text(".match-time"),
        homeTeam: text(".home-team"),
        awayTeam: text(".away-team"),
        venue: text(".arena, .hall, .match-location"),
        score:
          homeScore && awayScore ? `${homeScore} - ${awayScore}` : null
      };

      if (
        match.homeTeam &&
        match.awayTeam &&
        !results.some(
          m =>
            m.homeTeam === match.homeTeam &&
            m.awayTeam === match.awayTeam &&
            m.date === match.date
        )
      ) {
        results.push(match);
      }
    });

    return results;
  });

  console.log(`📊 Extracted matches: ${matches.length}`);
  console.log(JSON.stringify(matches.slice(0, 3), null, 2)); // preview first 3

  await browser.close();

  if (matches.length === 0) {
    throw new Error("❌ No matches extracted — see debug output above");
  }

  console.log("✅ Scraping completed successfully");
})();
