import { chromium } from "playwright";
import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/";

(async () => {
  const browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  console.log("➡️ Loading calendar...");
  await page.goto(URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  // 🔥 Wait for AJAX calendar to load
  await page.waitForFunction(() => {
    return document.querySelectorAll("tr").length > 10;
  });

  const events = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr"));

    const results = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "";

    // 🔥 Get month headers (same trick as your match scraper)
    const monthBlocks = Array.from(document.querySelectorAll("div.inner b"))
      .map(el => ({
        text: el.innerText.trim(),
        top: el.getBoundingClientRect().top
      }));

    rows.forEach(row => {
      const text = row.innerText.trim();
      const rowTop = row.getBoundingClientRect().top;

      // 🔥 Detect month for this row
      for (let i = monthBlocks.length - 1; i >= 0; i--) {
        if (monthBlocks[i].top <= rowTop) {
          currentMonth = monthBlocks[i].text;
          break;
        }
      }

      // 📅 DATE ROW
      if (row.className && row.className.includes("dag")) {
        const day = row.querySelector("b")?.innerText.trim() || "";
        const weekday = row.querySelector("font")?.innerText.trim() || "";

        currentDate = day;
        currentWeekday = weekday;
        return;
      }

      // ⏱ TIME
      const timeMatch = text.match(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/);
      if (!timeMatch) return;

      const [startTime, endTime] = timeMatch[0]
        .split("-")
        .map(t => t.trim());

      // 📍 LOCATION
      let location = "";
      const locCell = row.querySelector("td:nth-child(2)");
      if (locCell) {
        const parts = locCell.innerText.split(",");
        location = parts.length > 1
          ? parts[1].trim()
          : parts[0].trim();
      }

      // 👥 TEAM
      let team = "";
      const teamEl = row.querySelector("a");
      if (teamEl) {
        team = teamEl.innerText.trim();
      }

      // 🧹 CLEANING RULES
      team = team.replace(/\s+/g, " ").trim();
      team = team.replace("F ", "F").replace("P ", "P");

      location = location || "Unknown";
      team = team || "Unknown";

      // ❌ CANCELLED FILTER
      if (text.toLowerCase().includes("inställd")) return;

      results.push({
        date: `${currentWeekday} ${currentDate}`,
        month: currentMonth,
        startTime,
        endTime,
        team,
        location
      });
    });

    // 🔁 REMOVE DUPLICATES
    const unique = [];
    const seen = new Set();

    results.forEach(event => {
      const key = `${event.date}-${event.startTime}-${event.team}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(event);
      }
    });

    return unique;
  });

  await browser.close();

  if (!events.length) {
    throw new Error("❌ No events found");
  }

  const output = {
    scrapedAt: new Date().toISOString(),
    source: URL,
    eventCount: events.length,
    events
  };

  fs.writeFileSync(
    "calendar.json",
    JSON.stringify(output, null, 2),
    "utf-8"
  );

  console.log(`✅ Done. ${events.length} events saved to calendar.json`);
})();
