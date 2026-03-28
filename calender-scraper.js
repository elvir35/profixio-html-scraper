import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

(async () => {
  try {
    console.log("➡️ Fetching calendar (AJAX)...");

    const res = await axios.post(
      URL,
      new URLSearchParams({ ID: "331251" }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://h43lund.web.sportadmin.se/kalender/?ID=331251"
        },
        responseType: "arraybuffer"
      }
    );

    // 🔥 IMPORTANT: correct encoding
    const html = Buffer.from(res.data).toString("latin1");

    const $ = cheerio.load(html);

    const events = [];

    let currentDate = "";
    let currentWeekday = "";

    $("tr").each((i, el) => {
      const row = $(el);
      const rowText = row.text().trim();

      // 🔥 1. Detect date from .dag
      if (row.hasClass("dag")) {
        const font = row.find("font").first();

        currentWeekday = font
          .contents()
          .filter((_, el) => el.type === "text")
          .text()
          .trim();

        currentDate = row.find("b").first().text().trim();
      }

      // 🔥 2. Detect inline date (fix for March 29)
      const inlineDateMatch = rowText.match(/(mån|tis|ons|tor|fre|lör|sön)\s*(\d{1,2})/i);

      if (inlineDateMatch) {
        currentWeekday = inlineDateMatch[1];
        currentDate = inlineDateMatch[2];
      }

      // ❌ Skip until we have a date
      if (!currentDate || !currentWeekday) return;

      const finalDate = `${currentWeekday} ${currentDate}`;

      // 🔥 3. Extract events (IMPORTANT selector)
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

        // 📍 TYPE + DATA
        const lower = rawText.toLowerCase();

        let type = "";
        let location = "";
        let opponent = "";
        let title = "";

        const parts = rawText.split(",");

        if (lower.includes("borta") || lower.includes("hemma")) {
          type = "Match";
          opponent = parts[0]?.trim() || "";
          location = parts[1]?.trim() || "";
        } else if (lower.includes("träning")) {
          type = "Träning";
          location = parts[1]?.trim() || "";
        } else {
          type = "Övrigt";
          title = parts[0]?.trim() || "";
          location = parts[1]?.trim() || "";
        }

        events.push({
          date: finalDate,
          month: "Mars",
          startTime,
          endTime,
          team,
          location,
          type,
          title,
          opponent
        });
      });
    });

    console.log("📊 Parsed events:", events.length);

    fs.writeFileSync(
      "calendar.json",
      JSON.stringify(
        {
          scrapedAt: new Date().toISOString(),
          source: URL,
          eventCount: events.length,
          events
        },
        null,
        2
      )
    );

    console.log("✅ Done");

  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
