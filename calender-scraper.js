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

/* ✅ Clean HTML → text with line breaks */
function cleanHtmlText(html) {
  if (!html) return "";

  html = html.replace(/<br\s*\/?>/gi, "\n");

  let text = html.replace(/<[^>]+>/g, "");

  return text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ✅ Popup extraction (ONLY if "(..)" exists) */
function extractPopupInfo(row, $) {
  const link = row.find("a.kal[onmouseover*='sCal']");

  if (!link.length) return "";

  const onmouseover = link.attr("onmouseover");
  const match = onmouseover.match(/sCal\('([^']+)'/);

  if (!match) return "";

  const popupId = match[1];

  let popupDiv = $("#" + popupId);
  if (!popupDiv.length) {
    popupDiv = $(`[id="${popupId}"]`);
  }

  if (!popupDiv.length) return "";

  const html = popupDiv.html();
  return cleanHtmlText(html);
}

/* ✅ Safe fallback (only real detail rows) */
function extractFallbackInfo(row, $, location) {
  const nextRow = row.next();

  // Must exist AND be a detail row
  if (!nextRow || !nextRow.find(".calAkt2").length) {
    return "";
  }

  // Prevent grabbing next event
  if (nextRow.find("a").length > 0) {
    return "";
  }

  const html = nextRow.html();
  const text = cleanHtmlText(html);

  // Must match location to be valid
  if (location && !text.toLowerCase().includes(location.toLowerCase())) {
    return "";
  }

  return text;
}

/* ✅ Extract meeting time */
function extractMeetingTime(text) {
  const match = text.match(/Samling[: ]+(\d{1,2}:\d{2})/i);
  return match ? match[1] : "";
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

    const type = getType(row);

    // 🔥 Main logic
    let info = extractPopupInfo(row, $);

    if (!info) {
      info = extractFallbackInfo(row, $, location);
    }

    const meetingTime = extractMeetingTime(info);

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
