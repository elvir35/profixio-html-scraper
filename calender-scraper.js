import { chromium } from "playwright";
import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/?ID=331251";

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

    // 🔥 Get month headers
    const monthBlocks = Array.from(document.querySelectorAll("div.inner b"))
      .map(el => ({
        text: el.innerText.trim(),
        top: el.getBoundingClientRect().top
      }));

    rows.forEach(row => {
      const text = row.innerText.trim();
      const rowTop = row.getBoundingClientRect().top;

      // 🔥 Detect month
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

      // 📍 TYPE + LOCATION + EXTRA INFO (FINAL FIX)
let location = "";
let type = "";
let title = "";
let opponent = "";

const activityEl = row.querySelector(".kal");

if (activityEl) {
  const rawText = activityEl.innerText.trim();
  const lower = rawText.toLowerCase();

  const boldEl = activityEl.querySelector("b");

  // 🔴 MATCH (PRIMARY RULE)
  if (boldEl) {
    type = "Match";

    const boldText = boldEl.innerText;
    const parts = boldText.split(",");

    opponent = parts[0]?.trim() || "";
    location = parts[1]?.trim() || "";
  }

  // 🔴 MATCH (FALLBACK if no <b> but looks like match)
  else if (
    lower.includes(" borta") ||
    lower.includes(" hemma")
  ) {
    type = "Match";

    const parts = rawText.split(",");
    opponent = parts[0]?.trim() || "";
    location = parts[1]?.trim() || "";
  }

  // 🟦 TRÄNING
  else if (lower.includes("träning")) {
    type = "Träning";

    const parts = rawText.split(",");
    location = parts[1]?.trim() || "";
  }

  // 🟫 ÖVRIGT
  else {
    type = "Övrigt";

    const [titlePart, locationPart] = rawText.split(",");

    title = titlePart?.trim() || "";
    location = locationPart?.trim() || "";

    if (title.toLowerCase().includes("vs")) {
      opponent = title.split("vs")[1].trim();
    }
  }
}

// ✅ SAFETY
type = type || "Övrigt";

      // 👥 TEAM
      let team = "";
      const teamEl = row.querySelector("a");
      if (teamEl) {
        team = teamEl.innerText.trim();
      }

      // 🧹 CLEANING
      team = team.replace(/\s+/g, " ").trim();
      team = team.replace("F ", "F").replace("P ", "P");

      location = location || "Unknown";
      team = team || "Unknown";

      // ❌ CANCELLED
      if (text.toLowerCase().includes("inställd")) return;

      results.push({
        date: `${currentWeekday} ${currentDate}`,
        month: currentMonth,
        startTime,
        endTime,
        team,
        location,
        type,
        title,
        opponent
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
