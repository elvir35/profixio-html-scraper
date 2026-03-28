import axios from "axios";
import fs from "fs";

const BASE_URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function generateRanges(startDate, days = 90, step = 7) {
  const ranges = [];

  for (let i = 0; i < days; i += step) {
    const start = new Date(startDate);
    start.setDate(start.getDate() + i);

    const end = new Date(start);
    end.setDate(end.getDate() + step);

    ranges.push({
      start: formatDate(start),
      end: formatDate(end),
    });
  }

  return ranges;
}

(async () => {
  try {
    const ranges = generateRanges(new Date("2026-03-01"), 60, 7);

    let allEvents = [];

    for (const range of ranges) {
      const url = `${BASE_URL}?start=${range.start}&end=${range.end}`;
      console.log("Fetching:", url);

      const { data } = await axios.get(url);

      if (Array.isArray(data)) {
        allEvents = allEvents.concat(data);
      } else if (data?.events) {
        allEvents = allEvents.concat(data.events);
      }
    }

    const seen = new Set();
    const unique = allEvents
      .filter(e => e.team !== "Bollek Norr")
      .filter(e => {
        const key = `${e.date}-${e.startTime}-${e.team}-${e.location}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    fs.writeFileSync(
      "calendar_full.json",
      JSON.stringify({
        scrapedAt: new Date().toISOString(),
        count: unique.length,
        events: unique,
      }, null, 2)
    );

    console.log("Done. Events:", unique.length);

  } catch (err) {
    console.error(err);
  }
})();
