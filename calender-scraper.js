import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";
const CALENDAR_ID = 331251;

// Swedish month names
const MONTH_NAMES = [
  "Januari","Februari","Mars","April","Maj","Juni",
  "Juli","Augusti","September","Oktober","November","December"
];

function getCurrentMonth() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    monthName: MONTH_NAMES[now.getMonth()]
  };
}

function parseTime(timeText) {
  if (!timeText) return { startTime: "", endTime: "" };

  const clean = timeText.replace(/\s+/g, " ").trim();

  if (clean.includes("-")) {
    const [start, end] = clean.split("-");
    return {
      startTime: start.trim(),
      endTime: end.trim()
    };
  }

  return { startTime: clean, endTime: "" };
}

function parseTitle(title) {
  if (!title) return { opponent: "", location: "", title: "" };

  const parts = title.split(",");
  const opponent = parts[0]?.trim() || "";
  const location = parts[1]?.trim() || "";

  return {
    opponent,
    location,
    title: ""
  };
}

function getType(row) {
  if (row.find(".calBox1").length) return "Träning";
  if (row.find(".calBox2").length) return "Match";
  if (row.find(".calBox3").length) return "Övrigt";
  return "";
}

async function fetchMonth(month, year, monthName) {
  const url = `${BASE_URL}?ID=${CALENDAR_ID}&manad=${month}&ar=${year}`;
  console.log("Fetching:", url);

  // ✅ FIX: correct encoding
  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const html = Buffer.from(data, "binary").toString("utf-8");

  const $ = cheerio.load(html);

  const events = [];

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((_, el) => {
    const row = $(el);

    // ✅ FIX: only update on real date rows
    const dateCell = row.find("b").text().trim();
    const dayCell = row.find("font").text().trim();

    if (dateCell && dayCell && /^\d{1,2}$/.test(dateCell)) {
      currentDate = dateCell;
      currentDay = dayCell;
    }

    // ✅ FIX: only get time column (avoid duplicates)
    const timeText = row.find("td").eq(0).text().trim();

    const team = row.find("a").first().text().trim();
    const rawTitle = row.find("a.kal").first().text().trim();

    // Skip invalid rows
    if (!team || !rawTitle) return;

    const { startTime, endTime } = parseTime(timeText);
    const { opponent, location, title } = parseTitle(rawTitle);
    const type = getType(row);

    events.push({
      date: `${currentDay} ${currentDate}`,
      month: monthName,
      startTime,
      endTime,
      team,
      location,
      type,
      title,
      opponent
    });
  });

  return events;
}

(async () => {
  try {
    const { month, year, monthName } = getCurrentMonth();

    // Only current month
    const events = await fetchMonth(month, year, monthName);

    // Deduplicate
    const seen = new Set();
    const unique = events.filter(e => {
      const key = `${e.date}-${e.startTime}-${e.team}-${e.opponent}-${e.location}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // ✅ FIX: ensure proper encoding when saving
    fs.writeFileSync(
      "calendar.json",
      JSON.stringify(unique, null, 2),
      "utf-8"
    );

    console.log("✅ Done. Events:", unique.length);

  } catch (err) {
    console.error(err);
  }
})();
