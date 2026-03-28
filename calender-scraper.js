const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");

const URL = "https://h43lund.web.sportadmin.se/kalender/?ID=331251";

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

      // 🟡 Detect month
      const monthText = $row.find(".manad").text().trim();
      if (monthText) {
        currentMonth = monthText;
      }

      // 🟡 Detect date from .dag (original logic)
      const dagText = $row.find(".dag").text().trim();
      if (dagText) {
        const match = dagText.match(/(\d{1,2})\s*(\w+)/);
        if (match) {
          currentDate = match[1];
          currentWeekday = match[2];
        }
      }

      const rowText = $row.text().trim();

      // 🟢 ✅ FIX: fallback date detection (handles March 29 bug)
      const inlineDateMatch = rowText.match(/(mån|tis|ons|tor|fre|lör|sön)\s*(\d{1,2})/i);
      if (inlineDateMatch) {
        currentWeekday = inlineDateMatch[1];
        currentDate = inlineDateMatch[2];
      }

      // 🛑 Skip if still no date
      if (!currentDate || !currentWeekday) return;

      const cells = $row.find("td");

      if (cells.length < 4) return;

      const timeText = $(cells[1]).text().trim();
      const team = $(cells[2]).text().trim();
      const location = $(cells[3]).text().trim();
      const type = $(cells[4]).text().trim();
      const title = $(cells[5]).text().trim();
      const opponent = $(cells[6]).text().trim();

      // 🟡 Parse time
      let startTime = "";
      let endTime = "";

      if (timeText.includes("-")) {
        const parts = timeText.split("-");
        startTime = parts[0].trim();
        endTime = parts[1].trim();
      } else {
        startTime = timeText;
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

    // 🟢 Save file
    fs.writeFileSync("calendar.json", JSON.stringify({
      scrapedAt: new Date().toISOString(),
      source: URL,
      eventCount: events.length,
      events
    }, null, 2));

    console.log(`✅ Done! Saved ${events.length} events`);

  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
