import fs from "fs";
import * as cheerio from "cheerio";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

// 🧼 CLEAN HELPERS
function cleanDate(weekday, date) {
  if (!weekday || !date) return "";

  const wd = weekday.match(/(mån|tis|ons|tor|fre|lör|sön)/i)?.[0] || "";
  const d = date.match(/\d{1,2}/)?.[0] || "";

  return `${wd} ${d}`.trim();
}

function cleanLocation(location, opponent) {
  if (!location) return "Unknown";

  let cleaned = location;

  // Remove opponent if it leaked into location
  if (opponent) {
    cleaned = cleaned.replace(opponent, "");
  }

  // 🔥 Remove "Träning" anywhere
  cleaned = cleaned.replace(/träning/gi, "");

  // Remove parentheses content
  cleaned = cleaned.split("(")[0];

  // Keep only first part before comma
  cleaned = cleaned.split(",")[0];

  // Normalize spacing
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || "Unknown";
}

(async () => {
  try {
    console.log("➡️ Fetching calendar...");

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://h43lund.web.sportadmin.se/kalender/?ID=331251"
      },
      body: new URLSearchParams({ ID: "331251" })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    console.log("📦 HTML length:", html.length);

    const $ = cheerio.load(html);

    const events = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "Mars";

    $("tr").each((i, el) => {
      const row = $(el);

      // 📅 DATE ROW
      if (row.hasClass("dag")) {
        const font = row.find("font").first();

        let weekday = "";
        if (font.length) {
          weekday = font
            .contents()
            .filter((_, el) => el.type === "text")
            .text()
            .trim();
        }

        const date = row.find("b").first().text().trim();

        currentDate = date;
        currentWeekday = weekday;

        return;
      }

      if (!currentDate) return;

      // 📍 EVENT
      const activityEl = row.find("a.kal");
      if (!activityEl.length) return;

      const rawText = activityEl.text().trim();
      if (!rawText) return;

      // ⏱ TIME
      let startTime = "";
      let endTime = "";

      const rowText = row.text();

      const timeMatch = rowText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = rowText.match(/\b(\d{2}:\d{2})\b/);

      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

      // 👥 TEAM
      let team = "Unknown";

      row.find("a").each((i, a) => {
        const txt = $(a).text().trim();

        if (!$(a).hasClass("kal") && txt && txt.length < 50) {
          team = txt;
          return false;
        }
      });

      // 📍 TYPE / LOCATION / OPPONENT
      const lower = rawText.toLowerCase();

      let type = "";
      let location = "";
      let opponent = "";
      let title = "";

      if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";
        const parts = rawText.split(",");
        opponent = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      } else if (lower.includes("träning")) {
        type = "Träning";
        const parts = rawText.split(",");
        location = parts[1]?.trim() || "";
      } else {
        type = "Övrigt";
        const parts = rawText.split(",");
        title = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      }

      // ❌ Skip cancelled
      if (rawText.toLowerCase().includes("inställd")) return;

      // 🧼 CLEAN DATA
      const finalDate = cleanDate(currentWeekday, currentDate);
      const finalLocation = cleanLocation(location, opponent);

      events.push({
        date: finalDate,
        month: currentMonth,
        startTime,
        endTime,
        team,
        location: finalLocation,
        type,
        title,
        opponent
      });
    });

    console.log("📊 Parsed events:", events.length);

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

    console.log(`✅ Done. ${events.length} events saved`);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
