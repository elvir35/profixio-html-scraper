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

/* 🔥 FINAL FIX: AID-based popup matching */
function extractExtraInfoByAID($, eventAID) {
  let meetingTime = "";
  let info = "";

  if (!eventAID) return { meetingTime, info };

  // 🔥 Find popup that contains SAME AID
  const popup = $("div.calAkt1").filter((_, el) => {
    const html = $(el).html() || "";
    return html.includes(`AID=${eventAID}`);
  }).first();

  if (!popup.length) return { meetingTime, info };

  let html = popup.html() || "";

// 🔥 Convert block elements to line breaks
html = html
  .replace(/<\/div>/gi, "\n")   // end of div = new line
  .replace(/<br\s*\/?>/gi, "\n");

// 🔥 Remove all remaining HTML tags
let text = html.replace(/<[^>]+>/g, "");

// 🔥 Clean spacing properly
text = text
  .replace(/\r/g, "")
  .replace(/\n\s*\n\s*\n+/g, "\n\n") // collapse multiple empty lines
  .replace(/[ \t]+/g, " ")
  .replace(/\n /g, "\n")            // trim start of lines
  .trim();

  return { meetingTime, info };
}

async function fetchMonth(month, year, monthName) {
  const url = `${BASE_URL}?ID=${CALENDAR_ID}&manad=${month}&ar=${year}`;
  console.log("Fetching:", url);

  const { data } = await axios.get(url, { responseType: "arraybuffer" });
  const html = Buffer.from(data).toString("latin1");

  // 🔍 Debug save
  fs.writeFileSync("debug.html", html, "utf-8");

  const $ = cheerio.load(html);

  const events = [];

  let currentDate = "";
  let currentDay = "";

  $("table.mCal tr").each((_, el) => {
    const row = $(el);

    const dateCell = row.find("b").first().text().trim();
    const dayCell = row.find("font").first().text().trim();

    if (dateCell && /^\d{1,2}$/.test(dateCell)) {
      currentDate = dateCell;
      currentDay = dayCell;
    }

    const timeText = row.find("span").text().trim();
    const team = row.find("a").first().text().trim();
    const kalLink = row.find("a.kal").first();

    const rawTitle = kalLink.text().trim();
    const href = kalLink.attr("href") || "";

    if (!team || !rawTitle) return;

    // 🔥 Extract AID
    const aidMatch = href.match(/AID=(\d+)/);
    const eventAID = aidMatch ? aidMatch[1] : null;

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

    const type = getType(row);

    // 🔥 NEW: AID-based extraction (no more row bugs)
    const { meetingTime, info } = extractExtraInfoByAID($, eventAID);

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
