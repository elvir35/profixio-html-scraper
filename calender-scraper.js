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

  // Wait for initial content
  await page.waitForFunction(() => {
    return document.querySelectorAll("tr").length > 10;
  });

  // 🧠 STEP-BY-STEP SCROLL (Playwright)
console.log("⬇️ Scrolling step-by-step to load all events...");

await page.evaluate(async () => {
  const delay = ms => new Promise(res => setTimeout(res, ms));

  let lastHeight = 0;

  for (let i = 0; i < 40; i++) {
    window.scrollBy(0, 500); // simulate real user scroll
    await delay(300);

    const newHeight = document.body.scrollHeight;

    if (newHeight === lastHeight) {
      break; // no more content loading
    }

    lastHeight = newHeight;
  }
});

// Extra safety wait
await page.waitForTimeout(1000);

console.log("✅ Finished scrolling");

  const events = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr"));
    const results = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "";

    // 📅 Month headers
    const monthBlocks = Array.from(document.querySelectorAll("div.inner b")).map(el => ({
      text: el.innerText.trim(),
      top: el.getBoundingClientRect().top
    }));

    rows.forEach(row => {
      const text = row.innerText?.trim() || "";
      const rowTop = row.getBoundingClientRect().top;

      // 📆 Detect month
      for (let i = monthBlocks.length - 1; i >= 0; i--) {
        if (monthBlocks[i].top <= rowTop) {
          currentMonth = monthBlocks[i].text;
          break;
        }
      }

      // 📅 DATE ROW
      if (row.className && row.className.includes("dag")) {
        currentDate = row.querySelector("b")?.innerText?.trim() || "";
        currentWeekday = row.querySelector("font")?.innerText?.trim() || "";
        return;
      }

      if (!currentDate) return;

      // ⏱ TIME
      let startTime = "";
      let endTime = "";

      const fullTime = text.match(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/);
      const singleTime = text.match(/\b\d{2}:\d{2}\b/);

      if (fullTime) {
        [startTime, endTime] = fullTime[0]
          .split("-")
          .map(t => t.trim());
      } else if (singleTime) {
        startTime = singleTime[0];
      }

      // 📍 ACTIVITY
      const activityEl = row.querySelector(".kal");
      if (!activityEl) return;

      const rawText = activityEl.innerText?.trim() || "";
      if (!rawText) return;

      const lower = rawText.toLowerCase();

      let location = "";
      let type = "";
      let title = "";
      let opponent = "";

      // 🔴 MATCH
      if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";

        const cleaned = rawText.split("(")[0];
        const parts = cleaned.split(",");

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

        const cleaned = rawText.split("(")[0];
        const parts = cleaned.split(",");

        title = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";

        if (title.toLowerCase().includes("vs")) {
          opponent = title.split("vs")[1]?.trim() || "";
        }
      }

      // 👥 TEAM
      let team = "";

      const td = activityEl.closest("td");
      const links = td ? td.querySelectorAll("a") : [];

      for (let i = 0; i < links.length; i++) {
        const txt = links[i].innerText?.trim();

        if (links[i].classList.contains("kal")) continue;

        if (txt) {
          team = txt;
          break;
        }
      }

      team = team.replace(/\s+/g, " ").trim();
      team = team.replace("F ", "F").replace("P ", "P");

      location = location || "Unknown";
      team = team || "Unknown";
      type = type || "Övrigt";

      if (text.toLowerCase().includes("inställd")) return;

      if (!team && !location && !startTime && !opponent) return;

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

    // 🔁 Deduplicate
    const unique = [];
    const seen = new Set();

    results.forEach(event => {
      const key = `${event.date}-${event.startTime}-${event.team}-${event.location}-${event.opponent}`;

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
