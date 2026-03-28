import fs from "fs";
import * as cheerio from "cheerio";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

// 🧼 CLEAN HELPERS
function cleanDate(weekday, date) {
  if (!weekday || !date) return "";

  const wd = weekday.match(/(mån|tis|ons|tor|fre|lör|sön)/i)?.[0] || "";
  const d = date.match(/\d{1,2}/)?.[0] || "";

  return `${wd} ${d}`.trim();
}

function cleanLocation(location, opponent) {
  if (!location) return "Unknown";

  let cleaned = location;

  if (opponent) {
    cleaned = cleaned.replace(opponent, "");
  }

  // remove "Träning"
  cleaned = cleaned.replace(/träning/gi, "");

  // remove parentheses
  cleaned = cleaned.split("(")[0];

  // split glued words (ArenaSomething)
  cleaned = cleaned.replace(/([a-zåäö])([A-ZÅÄÖ])/g, "$1|$2");
  cleaned = cleaned.split("|")[0];

  // remove after comma
  cleaned = cleaned.split(",")[0];

  // remove duplicate words
  const words = cleaned.split(" ");
  cleaned = [...new Set(words)].join(" ");

  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || "Unknown";
}

(async () => {
  try {
    console.log("➡️ Fetching calendar...");

    const res = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://h43lund.web.sportadmin.se/kalender/?ID=331251"
      },
      body: new URLSearchParams({ ID: "331251" })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    console.log("📦 HTML length:", html.length);

    const $ = cheerio.load(html);

    const events = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "Mars";

    $("tr").each((i, el) => {
      const row = $(el);

      // 📅 DATE ROW
      if (row.hasClass("dag")) {
        const font = row.find("font").first();

        let weekday = "";
        if (font.length) {
          weekday = font
            .contents()
            .filter((_, el) => el.type === "text")
            .text()
            .trim();
        }

        const date = row.find("b").first().text().trim();

        currentDate = date;
        currentWeekday = weekday;
        return;
      }

      if (!currentDate) return;

      // 🔥 EVENT TEXT (robust)
      let rawText = row.find("a.kal").text().trim();

      // fallback: any link
      if (!rawText) {
        const links = row.find("a");

        links.each((i, el) => {
          const txt = $(el).text().trim();

          if (
            txt &&
            txt.length > 3 &&
            !txt.match(/^\d{2}:\d{2}$/)
          ) {
            rawText = txt;
            return false;
          }
        });
      }

      if (!rawText) return;

      // ⏱ TIME
      let startTime = "";
      let endTime = "";

      const rowText = row.text();

      const timeMatch = rowText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = rowText.match(/\b(\d{2}:\d{2})\b/);

      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

      // 👥 TEAM
      let team = "Unknown";

      row.find("a").each((i, a) => {
        const txt = $(a).text().trim();

        if (
          !$(a).hasClass("kal") &&
          txt &&
          txt.length < 50 &&
          !txt.match(/\d{2}:\d{2}/)
        ) {
          team = txt;
          return false;
        }
      });

      // 📍 TYPE / LOCATION / OPPONENT
      const lower = rawText.toLowerCase();

      let type = "";
      let location = "";
      let opponent = "";
      let title = "";

      if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";
        const parts = rawText.split(",");
        opponent = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      } else if (lower.includes("träning")) {
        type = "Träning";
        const parts = rawText.split(",");
        location = parts[1]?.trim() || "";
      } else {
        type = "Övrigt";
        const parts = rawText.split(",");
        title = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      }

      if (rawText.toLowerCase().includes("inställd")) return;

      const finalDate = cleanDate(currentWeekday, currentDate);
      const finalLocation = cleanLocation(location, opponent);

      events.push({
        date: finalDate,
        month: currentMonth,
        startTime,
        endTime,
        team,
        location: finalLocation,
        type,
        title,
        opponent
      });
    });

    console.log("📊 Parsed events before dedup:", events.length);

    // 🔁 DEDUP
    const unique = [];
    const seen = new Set();

    for (const e of events) {
      const key = `${e.date}-${e.startTime}-${e.team}-${e.location}-${e.opponent}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(e);
      }
    }

    console.log("📊 Parsed events after dedup:", unique.length);

    const output = {
      scrapedAt: new Date().toISOString(),
      source: URL,
      eventCount: unique.length,
      events: unique
    };

    fs.writeFileSync(
      "calendar.json",
      JSON.stringify(output, null, 2),
      "utf-8"
    );

    console.log(`✅ Done. ${unique.length} events saved`);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
