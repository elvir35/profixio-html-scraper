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

  await page.waitForFunction(() => {
    return document.querySelectorAll("tr").length > 10;
  });

  const events = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr"));
    const results = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "";

    const monthBlocks = Array.from(document.querySelectorAll("div.inner b"))
      .map(el => ({
        text: el.innerText.trim(),
        top: el.getBoundingClientRect().top
      }));

    rows.forEach(row => {
      const text = row.innerText.trim();
      const rowTop = row.getBoundingClientRect().top;

      for (let i = monthBlocks.length - 1; i >= 0; i--) {
        if (monthBlocks[i].top <= rowTop) {
          currentMonth = monthBlocks[i].text;
          break;
        }
      }

      // 📅 DATE
      if (row.className && row.className.includes("dag")) {
        currentDate = row.querySelector("b")?.innerText.trim() || "";
        currentWeekday = row.querySelector("font")?.innerText.trim() || "";
        return;
      }

      // ⏱ TIME
      const timeMatch = text.match(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/);
      if (!timeMatch) return;

      const [startTime, endTime] = timeMatch[0].split("-").map(t => t.trim());

      // 📍 TYPE + LOCATION (SAFE VERSION)
      let location = "";
      let type = "";
      let title = "";
      let opponent = "";

      const activityEl = row.querySelector(".kal");

      if (activityEl) {
        const rawText = activityEl.innerText.trim();
        const lower = rawText.toLowerCase();
        const boldEl = activityEl.querySelector("b");

        // 🔴 MATCH
        if (boldEl) {
          type = "Match";

          const parts = boldEl.innerText.split(",");
          opponent = parts[0]?.trim() || "";
          location = parts[1]?.trim() || "";
        }

        // 🔴 MATCH fallback
        else if (lower.includes(" borta") || lower.includes(" hemma")) {
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

          const parts = rawText.split(",");
          title = parts[0]?.trim() || "";
          location = parts[1]?.trim() || "";

          if (title.toLowerCase().includes("vs")) {
            opponent = title.split("vs")[1]?.trim() || "";
          }
        }
      }

      // ✅ FALLBACK
      type = type || "Övrigt";

      // 👥 TEAM
      let team = row.querySelector("a")?.innerText.trim() || "";

      team = team.replace(/\s+/g, " ").trim();
      team = team.replace("F ", "F").replace("P ", "P");

      location = location || "Unknown";
      team = team || "Unknown";

      if (text.toLowerCase().includes("inställd")) return;

      results.push({
        date: `${currentWeekday} ${currentDate} ${currentMonth}`,
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

  fs.writeFileSync("calendar.json", JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ Done. ${events.length} events saved to calendar.json`);
})();
