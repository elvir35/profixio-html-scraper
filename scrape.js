import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.profixio.com/app/lx/competition/leagueid17956/teams/1403367?t=schedule";

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ✅ Correct place to set user agent
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
  });

  const page = await context.newPage();

  await page.goto(URL, { waitUntil: "domcontentloaded" });

  /* Cookie consent (safe) */
  try {
    await page.waitForSelector("button:has-text('Godkänn')", { timeout: 5000 });
    await page.click("button:has-text('Godkänn')");
    console.log("Cookie consent accepted");
  } catch {
    console.log("No cookie banner");
  }

  /* Wait for schedule container */
  await page.waitForSelector("text=Spelschema", { timeout: 15000 });

  /* Give JS time to render */
  await page.waitForTimeout(3000);

  const matchCount = await page.evaluate(
    () => document.querySelectorAll("[data-match-id]").length
  );

  if (matchCount === 0) {
    const html = await page.content();
    fs.writeFileSync("debug.html", html);
    throw new Error("No matches rendered — debug.html saved");
  }

  const matches = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-match-id]")).map(el => {
      const root = el.closest("div");

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
          root?.querySelector(".home-score") &&
          root?.querySelector(".away-score")
            ? `${root.querySelector(".home-score").innerText} - ${
                root.querySelector(".away-score").innerText
              }`
            : null
      };
    })
  );

  await browser.close();

  fs.writeFileSync(
    "matches.json",
    JSON.stringify(
      {
        scrapedAt: new Date().toISOString(),
        source: URL,
        matches
      },
      null,
      2
    )
  );

  console.log(`Scraped ${matches.length} matches`);
})();
