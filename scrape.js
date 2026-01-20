import { chromium } from "playwright";
import fs from "fs";

const URL =
  "https://www.profixio.com/app/lx/competition/leagueid17956/teams/1403367?t=schedule";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Load page and wait for JS to finish
  await page.goto(URL, { waitUntil: "networkidle" });

  // Wait until matches appear in DOM
  await page.waitForSelector("[data-match-id]", { timeout: 15000 });

  // Extract data from rendered DOM
  const matches = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("[data-match-id]")).map(el => {
      const root = el.closest("div");

      return {
        id: el.dataset.matchId,
        date: root.querySelector(".match-date")?.innerText ?? null,
        time: root.querySelector(".match-time")?.innerText ?? null,
        homeTeam: root.querySelector(".home-team")?.innerText ?? null,
        awayTeam: root.querySelector(".away-team")?.innerText ?? null,
        venue:
          root.querySelector(".arena, .hall, .match-location")?.innerText ??
          null,
        score:
          root.querySelector(".home-score") && root.querySelector(".away-score")
            ? `${root.querySelector(".home-score").innerText} - ${
                root.querySelector(".away-score").innerText
              }`
            : null
      };
    });
  });

  await browser.close();

  // Output JSON
  const output = {
    scrapedAt: new Date().toISOString(),
    source: URL,
    matches
  };

  console.log(JSON.stringify(output, null, 2));

  // Optional: save file
  fs.writeFileSync("matches.json", JSON.stringify(output, null, 2));
})();
