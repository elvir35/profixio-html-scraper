import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp?ID=331251";

(async () => {
  try {
    const { data } = await axios.get(URL);
    const $ = cheerio.load(data);

    const events = [];

    let currentMonth = "";
    let currentDate = "";
    let currentWeekday = "";

    $(".calendarTable tr").each((i, row) => {
      const $row = $(row);

      // 🟡 Month
      const monthText = $row.find(".manad").text().trim();
      if (monthText) currentMonth = monthText;

      // 🟡 .dag date
      const dagText = $row.find(".dag").text().trim();
      if (dagText) {
        const match = dagText.match(/(\d{1,2})\s*(\w+)/);
        if (match) {
          currentDate = match[1];
          currentWeekday = match[2];
        }
      }

      const rowText = $row.text().trim();

      // 🔥 FIX: inline date (March 29 etc)
      const inlineDateMatch = rowText.match(/(mån|tis|ons|tor|fre|lör|sön)\s*(\d{1,2})/i);
      if (inlineDateMatch) {
        currentWeekday = inlineDateMatch[1];
        currentDate = inlineDateMatch[2];
      }

      // ❌ skip if no date
      if (!currentDate || !currentWeekday) return;

      const cells = $row.find("td");
      if (cells.length < 3) return;

      const timeText = $(cells[1]).text().trim();
      const team = $(cells[2]).text().trim();
      const location = $(cells[3]).text().trim();

      // ⏱ time parsing
      let startTime = "";
      let endTime = "";

      if (timeText.includes("-")) {
        const parts = timeText.split("-");
        startTime = parts[0].trim();
        endTime = parts[1].trim();
      } else {
        startTime = timeText;
      }

      // 📍 detect type/opponent
      const lower = location.toLowerCase();

      let type = "";
      let opponent = "";
      let title = "";

      if (lower.includes("träning")) {
        type = "Träning";
      } else if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";
        opponent = location.split(",")[0];
      } else {
        type = "Övrigt";
        title = location.split(",")[0];
      }

      events.push({
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

    console.log(`✅ Done! Saved ${events.length} events`);

  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
