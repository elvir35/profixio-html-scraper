import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";
const CALENDAR_ID = 331251; // H43 Lund

async function fetchMonth(month, year) {
  const url = `${BASE_URL}?ID=${CALENDAR_ID}&manad=${month}&ar=${year}`;
  console.log("Fetching:", url);

  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const events = [];

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((_, el) => {
    const row = $(el);

    // Detect date row
    const dateCell = row.find("b").first().text().trim();
    const dayCell = row.find("font").first().text().trim();

    if (dateCell) {
      currentDate = dateCell;
      currentDay = dayCell;
    }

    // Detect event rows
    const time = row.find("span").text().trim();
    const team = row.find("a").first().text().trim();
    const title = row.find("a.kal").first().text().trim();

    if (team && title) {
      events.push({
        date: currentDate,
        day: currentDay,
        month,
        year,
        time,
        team,
        title,
      });
    }
  });

  return events;
}

(async () => {
  try {
    let allEvents = [];

    // Fetch multiple months
    for (let month = 3; month <= 4; month++) {
      const events = await fetchMonth(month, 2026);
      allEvents = allEvents.concat(events);
    }

    // Deduplicate
    const seen = new Set();
    const unique = allEvents.filter(e => {
      const key = `${e.date}-${e.time}-${e.team}-${e.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    fs.writeFileSync(
      "calendar_full.json",
      JSON.stringify({
        count: unique.length,
        events: unique,
      }, null, 2)
    );

    console.log("✅ Done. Events:", unique.length);

  } catch (err) {
    console.error(err);
  }
})();
