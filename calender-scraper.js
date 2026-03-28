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

  if (timeText.includes("-")) {
    const [start, end] = timeText.split("-").map(t => t.trim());
    return { startTime: start, endTime: end };
  }

  return { startTime: timeText.trim(), endTime: "" };
}

function parseTitle(title) {
  if (!title) return { opponent: "", location: "", title: "" };

  // Example:
  // "Ljunghusens HK borta, Henriksdalshallen"
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

async function fetchCurrentMonth() {
  const { month, year, monthName } = getCurrentMonth();

  const url = `${BASE_URL}?ID=${CALENDAR_ID}&manad=${month}&ar=${year}`;
  console.log("Fetching:", url);

  const { data } = await axios.get(url);
  const $ = cheerio.load(data);

  const events = [];

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((_, el) => {
    const row = $(el);

    // Detect new day
    const date = row.find("b").first().text().trim();
    const day = row.find("font").first().text().trim();

    if (date) {
      currentDate = date;
      currentDay = day;
    }

    const link = row.find("a.kal").first();

    // Skip tooltip duplicates
    if (!link.length || row.find(".calAkt1").length) return;

    const rawTitle = link.text().trim();
    const team = row.find("a").first().text().trim();
    const timeText = row.find("span").text().trim();

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

  // Deduplicate
  const seen = new Set();
  const unique = events.filter(e => {
    const key = `${e.date}-${e.startTime}-${e.team}-${e.opponent}-${e.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
}

(async () => {
  try {
    const events = await fetchCurrentMonth();

    fs.writeFileSync(
      "calendar_current_month.json",
      JSON.stringify(events, null, 2)
    );

    console.log("✅ Done. Events:", events.length);

  } catch (err) {
    console.error(err);
  }
})();
