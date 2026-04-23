import { chromium } from "playwright";
import fs from "fs";

const BASE =
  "https://h43lund.web.sportadmin.se/match/?ID=331249";

const URLS = [
  { url: BASE + "&kommande=1", status: "upcoming" },
  { url: BASE + "&spelade=1", status: "played" }
];

(async () => {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  const allMatches = [];

  for (const { url, status } of URLS) {
    console.log(`➡️ Loading ${status}: ${url}`);

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    let hasMatches = true;

    try {
      // ⏱️ shorter timeout → fail fast when no matches exist
      await page.waitForFunction(
        () => document.querySelectorAll("a[href*='AID=']").length > 0,
        { timeout: 5000 }
      );
    } catch (e) {
      console.log(`⚠️ No matches found for ${status}`);
      hasMatches = false;
    }

    // 👉 If no matches → skip scraping but continue flow
    if (!hasMatches) continue;

    const matches = await page.evaluate((status) => {
      const rows = Array.from(document.querySelectorAll("tr"));

      const results = [];

      let currentDate = "";
      let currentMonth = "";

      const monthBlocks = Array.from(document.querySelectorAll("div.inner b"))
        .map(el => ({
          text: el.innerText.trim(),
          top: el.getBoundingClientRect().top
        }));

      rows.forEach(row => {
        const rowTop = row.getBoundingClientRect().top;

        for (let i = monthBlocks.length - 1; i >= 0; i--) {
          if (monthBlocks[i].top <= rowTop) {
            currentMonth = monthBlocks[i].text;
            break;
          }
        }

        const text = row.innerText.trim();

        if (row.className && row.className.includes("dag")) {
          const dayEl = row.querySelector("b");
          const weekdayEl = row.querySelector("font");

          const day = dayEl ? dayEl.innerText.trim() : "";
          const weekday = weekdayEl ? weekdayEl.innerText.trim() : "";

          currentDate = `${weekday} ${day}`.trim();
          return;
        }

        const link = row.querySelector("a[href*='AID=']");
        if (!link) return;

        const matchText = link.innerText;
        if (!matchText.includes(" - ")) return;

        const [home, away] = matchText.split(" - ");

        const timeMatch = text.match(/\d{2}:\d{2}/);
        const time = timeMatch ? timeMatch[0] : "";

        const teamLink = row.querySelector("a[href*='ID=']");
        const team = teamLink ? teamLink.innerText.trim() : "";

        let hall = "";
        const hallContainer = row.querySelector("td:nth-child(2)");
        if (hallContainer) {
          const parts = hallContainer.innerText.split(",");
          if (parts.length > 1) {
            hall = parts[1].trim();
          }
        }

        const img = row.querySelector("img");
        const logo = img ? img.src : "";

        let score = "";

        if (status === "played") {
          const scoreCell = row.querySelector("td[align='right']");

          if (scoreCell) {
            const raw = scoreCell.innerText.trim();
            const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);

            if (match) {
              score = `${match[1]} - ${match[2]}`;
            }
          }
        }

        results.push({
          team,
          hall,
          time,
          date: currentDate,
          month: currentMonth,
          home: home.trim(),
          away: away.trim(),
          score,
          logo,
          status
        });
      });

      return results;
    }, status);

    allMatches.push(...matches);
  }

  await browser.close();

  // ✅ NEW: handle empty result WITHOUT throwing
  const output = {
    scrapedAt: new Date().toISOString(),
    source: BASE,
    matchCount: allMatches.length,
    hasMatches: allMatches.length > 0,
    message:
      allMatches.length === 0
        ? "No new or upcoming matches found (season may be finished)"
        : "Matches retrieved successfully",
    matches: allMatches
  };

  fs.writeFileSync("matches.json", JSON.stringify(output, null, 2), "utf-8");

  console.log(
    allMatches.length
      ? `✅ Done. ${allMatches.length} matches saved`
      : "ℹ️ No matches found, but run completed successfully"
  );
})();
