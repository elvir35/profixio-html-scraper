import fs from "fs";
import * as cheerio from "cheerio";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

// 🧼 CLEAN HELPERS
function cleanDate(weekday, date) {
  const wd = weekday.match(/(mån|tis|ons|tor|fre|lör|sön)/i)?.[0] || "";
  const d = date.match(/\d{1,2}/)?.[0] || "";
  return `${wd} ${d}`.trim();
}

function cleanLocation(location, opponent) {
  if (!location) return "Unknown";

  let cleaned = location;

  if (opponent) cleaned = cleaned.replace(opponent, "");

  cleaned = cleaned.replace(/träning/gi, "");
  cleaned = cleaned.split("(")[0];
  cleaned = cleaned.replace(/([a-zåäö])([A-ZÅÄÖ])/g, "$1|$2");
  cleaned = cleaned.split("|")[0];
  cleaned = cleaned.split(",")[0];
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

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    const $ = cheerio.load(html);

    const events = [];

    let currentDate = "";
    let currentWeekday = "";

    $("tr").each((i, el) => {
      const row = $(el);
      const rowText = row.text().trim();

      // 🔥 1. Detect DATE from "01 sön" format
      const firstCellText = row.find("td").first().text().trim();
      const dateMatch = firstCellText.match(/(\d{1,2})\s*(mån|tis|ons|tor|fre|lör|sön)/i);

      if (dateMatch) {
        currentDate = dateMatch[1];
        currentWeekday = dateMatch[2];
      }

      // 🔥 2. Detect DATE from .dag rows
      if (row.hasClass("dag")) {
        const font = row.find("font").first();

        currentWeekday = font
          .contents()
          .filter((_, el) => el.type === "text")
          .text()
          .trim();

        currentDate = row.find("b").first().text().trim();
      }

      // 🔥 CRITICAL FIX: enforce strict grouping
      if (!currentDate || !currentWeekday) return;

      const finalDate = cleanDate(currentWeekday, currentDate);

      // 🔥 3. Extract events ONLY if date exists
      row.find(".calAkt3").each((i, eventEl) => {
        const eventNode = $(eventEl);

        const activityLink = eventNode.find("a.kal").first();
        if (!activityLink.length) return;

        const rawText = activityLink.text().trim();

        // ⏱ TIME
        let startTime = "";
        let endTime = "";

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
        const teamLink = row.find("td a").first();
        if (teamLink.length) {
          team = teamLink.text().trim();
        }

        // 📍 TYPE
        const lower = rawText.toLowerCase();

        let type = "";
        let location = "";
        let opponent = "";
        let title = "";

        const parts = rawText.split(",");

        if (lower.includes("borta") || lower.includes("hemma")) {
          type = "Match";
          opponent = parts.length > 0 ? parts[0].trim() : "";
          location = parts.length > 1 ? parts[1].trim() : "";
        } else if (lower.includes("träning")) {
          type = "Träning";
          location = parts.length > 1 ? parts[1].trim() : "";
        } else {
          type = "Övrigt";
          title = parts.length > 0 ? parts[0].trim() : "";
          location = parts.length > 1 ? parts[1].trim() : "";
        }

        const finalLocation = cleanLocation(location, opponent);

        events.push({
          date: finalDate, // 🔥 ALWAYS correct now
          month: "Mars",
          startTime,
          endTime,
          team,
          location: finalLocation,
          type,
          title,
          opponent
        });
      });
    });

    console.log("📊 Parsed events:", events.length);

    fs.writeFileSync(
      "calendar.json",
      JSON.stringify(events, null, 2),
      "utf-8"
    );

    console.log("✅ Done");

  } catch (err) {
    console.error("❌ Scraper failed:", err);
  }
})();
