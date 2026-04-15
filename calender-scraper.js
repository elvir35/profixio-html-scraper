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

  const match = timeText.match(/\d{2}:\d{2}(\s*-\s*\d{2}:\d{2})?/);
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
  return {
    opponent: parts[0]?.trim() || "",
    location: parts[1]?.trim() || "",
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

  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const html = Buffer.from(data).toString("latin1");

  const $ = cheerio.load(html);

  const events = [];
  let currentEvent = null;

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((i, el) => {
    const row = $(el);

    // Date handling
    const dateCell = row.find("b").first().text().trim();
    const dayCell = row.find("font").first().text().trim();

    if (dateCell && /^\d{1,2}$/.test(dateCell)) {
      currentDate = dateCell;
      currentDay = dayCell;
    }

    // 🔥 FIXED DETAILS HANDLING
    if (row.find(".calAkt2").length && currentEvent && !currentEvent._detailsCaptured) {
      currentEvent._detailsCaptured = true;

      const detailDiv = row.find(".calAkt2");
      let rawText = detailDiv.text().trim();

      // Split into logical lines
      let lines = rawText
        .split(/\n|(?=[A-ZÅÄÖ][a-zåäö]+ (hemma|borta))/)
        .map(l => l.trim())
        .filter(Boolean);

      // Extract meeting time
      const samlingMatch = rawText.match(/Samling[: ]+(\d{1,2}:\d{2})/i);
      if (samlingMatch) {
        currentEvent.meetingTime = samlingMatch[1];
      }

      // Keep only first relevant block
      let validLines = [];

      for (const line of lines) {
        const lower = line.toLowerCase();

        // Stop if new event-like content appears
        if (
          lower.includes(" borta") ||
          lower.includes(" hemma") ||
          lower.includes(" cup") ||
          lower.includes(" match")
        ) {
          if (validLines.length > 0) break;
        }

        validLines.push(line);
      }

      currentEvent.info = validLines.join("\n").trim();

      return;
    }

    // Event row
    const timeText = row.find("span").text().trim();
    const team = row.find("a").first().text().trim();
    const rawTitle = row.find("a.kal").first().text().trim();

    if (!team || !rawTitle) return;

    const { startTime, endTime } = parseTime(timeText);
    const { opponent, location, title } = parseTitle(rawTitle);

    const isHome = /hemma/i.test(opponent);
    const isAway = /borta/i.test(opponent);

    let cleanOpponent = opponent
      .replace(/\s+(hemma|borta)$/i, "")
      .trim();

    if (/träning/i.test(cleanOpponent)) {
      cleanOpponent = "";
    }

    const event = {
      date: `${currentDay} ${currentDate}`,
      month: monthName,
      startTime,
      endTime,
      team,
      location,
      type: getType(row),
      title,
      opponent: cleanOpponent,
      homeAway: isHome ? "hemma" : isAway ? "borta" : "",
      meetingTime: "",
      info: ""
    };

    events.push(event);
    currentEvent = event;
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
