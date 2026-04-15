import axios from "axios";
import * as cheerio from "cheerio";
import fs from "fs";

const BASE_URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";
const CALENDAR_ID = 331251;

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

  let clean = timeText.replace(/\s+/g, " ").trim();
  clean = clean.replace("Flera dagar", "").trim();

  const match = clean.match(/\d{2}:\d{2}(\s*-\s*\d{2}:\d{2})?/);

  if (!match) return { startTime: "", endTime: "" };

  const value = match[0];

  if (value.includes("-")) {
    const [start, end] = value.split("-");
    return {
      startTime: start.trim(),
      endTime: end.trim()
    };
  }

  return { startTime: value.trim(), endTime: "" };
}

function parseTitle(title) {
  if (!title) return { opponent: "", location: "", title: "" };

  const parts = title.split(",");
  const opponent = parts[0]?.trim() || "";
  const location = parts[1]?.trim() || "";

  return { opponent, location, title: "" };
}

function getType(row) {
  if (row.find(".calBox1").length) return "Träning";
  if (row.find(".calBox2").length) return "Match";
  if (row.find(".calBox3").length) return "Övrigt";
  return "";
}

/* 🔥 NEW: Validate that info belongs to this event */
function isMatchingEvent(event, infoText) {
  if (!infoText) return false;

  const normalizedInfo = infoText.toLowerCase();

  // Match opponent
  if (event.opponent && normalizedInfo.includes(event.opponent.toLowerCase())) {
    return true;
  }

  // Match location (strong signal)
  if (event.location && normalizedInfo.includes(event.location.toLowerCase())) {
    return true;
  }

  return false;
}

async function fetchMonth(month, year, monthName) {
  const url = `${BASE_URL}?ID=${CALENDAR_ID}&manad=${month}&ar=${year}`;
  console.log("Fetching:", url);

  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const html = Buffer.from(data).toString("latin1");

  const $ = cheerio.load(html);

  const events = [];

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((i, el) => {
    const row = $(el);

    const dateCell = row.find("b").first().text().trim();
    const dayCell = row.find("font").first().text().trim();

    if (dateCell && /^\d{1,2}$/.test(dateCell)) {
      currentDate = dateCell;
      currentDay = dayCell;
    }

    const timeText = row.find("span").text().trim();
    const team = row.find("a").first().text().trim();
    const rawTitle = row.find("a.kal").first().text().trim();

    if (!team || !rawTitle) return;

    const { startTime, endTime } = parseTime(timeText);
    const { opponent, location, title } = parseTitle(rawTitle);

    let meetingTime = "";
    let info = "";

    // 🔥 Look at next row
    const nextRow = $(el).next();

    if (nextRow && nextRow.find(".calAkt2").length) {
      const details = nextRow.find(".calAkt2");

      const extractedText = details
        .find("div")
        .map((_, el) => $(el).text().trim())
        .get()
        .join("\n")
        .trim();

      // 🔥 ONLY attach if it matches this event
      if (isMatchingEvent({ opponent, location }, extractedText)) {

        const meetingMatch = extractedText.match(/Samling:\s*(\d{2}:\d{2})/);
        if (meetingMatch) {
          meetingTime = meetingMatch[1];
        }

        const infoBlocks = details.find("div").filter((_, el) => {
          const text = $(el).text().trim();
          return text && !text.includes("Samling");
        });

        info = infoBlocks
          .map((_, el) => $(el).text().trim())
          .get()
          .join("\n")
          .trim();
      }
    }

    const isHome = /hemma/i.test(opponent);
    const isAway = /borta/i.test(opponent);

    let cleanOpponent = opponent
      .replace(/\s+(hemma|borta)$/i, "")
      .trim();

    if (/träning/i.test(cleanOpponent)) {
      cleanOpponent = "";
    }

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
      opponent: cleanOpponent,
      homeAway: isHome ? "hemma" : isAway ? "borta" : "",
      meetingTime,
      info
    });
  });

  return events;
}

(async () => {
  try {
    const { month, year, monthName } = getCurrentMonth();

    const events = await fetchMonth(month, year, monthName);

    const seen = new Set();
    const unique = events.filter(e => {
      const key = `${e.date}-${e.startTime}-${e.team}-${e.opponent}-${e.location}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

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
