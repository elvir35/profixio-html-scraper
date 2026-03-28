import fs from "fs";
import * as cheerio from "cheerio";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

// 🧼 CLEAN HELPERS
function cleanDate(weekday, date) {
  const wd = weekday.match(/(mån|tis|ons|tor|fre|lör|sön)/i)?.[0] || "";
  const d = date.match(/\d{1,2}/)?.[0] || "";
  return `${wd} ${d}`.trim();
}

function cleanLocation(location, opponent) {
  if (!location) return "Unknown";

  let cleaned = location;

  if (opponent) cleaned = cleaned.replace(opponent, "");

  cleaned = cleaned.replace(/träning/gi, "");
  cleaned = cleaned.split("(")[0];
  cleaned = cleaned.replace(/([a-zåäö])([A-ZÅÄÖ])/g, "$1|$2");
  cleaned = cleaned.split("|")[0];
  cleaned = cleaned.split(",")[0];

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

    // 🔥 LOOP DAY BLOCKS (KEY FIX)
    $(".inner").each((i, dayBlock) => {
      const block = $(dayBlock);

      // 📅 DATE
      const dateText = block.find("b").first().text().trim();

      const weekday = block.find("font")
        .contents()
        .filter((_, el) => el.type === "text")
        .text()
        .trim();

      const finalDate = cleanDate(weekday, dateText);

      // ❌ skip if no valid date
      if (!finalDate) return;

      // 🔥 EVENTS INSIDE DAY
      block.find(".calAkt3").each((i, eventEl) => {
        const eventNode = $(eventEl);

        const rawText = eventNode.find("a.kal").first().text().trim();
        if (!rawText) return;

        const parentRow = eventNode.closest("tr");
        const rowText = parentRow.text();

        // ⏱ TIME
        let startTime = "";
        let endTime = "";

        const timeMatch = rowText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
        const singleTime = rowText.match(/\b(\d{2}:\d{2})\b/);

        if (timeMatch) {
          startTime = timeMatch[1];
          endTime = timeMatch[2];
        } else if (singleTime) {
          startTime = singleTime[1];
        }

        // 👥 TEAM (correct per event)
        let team = "Unknown";
        const teamLink = eventNode.closest("td").find("a").first();

        if (teamLink.length) {
          team = teamLink.text().trim();
        }

        // 📍 TYPE / LOCATION
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

        // ❌ Skip cancelled
        if (rawText.toLowerCase().includes("inställd")) return;

        const finalLocation = cleanLocation(location, opponent);

        events.push({
          date: finalDate,
          month: "Mars",
          startTime,
          endTime,
          team,
          location: finalLocation,
          type,
          title,
          opponent
        });
      });
    });

    console.log("📊 Parsed events before dedup:", events.length);

    // 🔁 DEDUP
    const uniqueMap = new Map();

    events.forEach(e => {
      const key = `${e.date}-${e.startTime}-${e.team}-${e.location}-${e.opponent}`;
      uniqueMap.set(key, e);
    });

    const finalEvents = Array.from(uniqueMap.values());

    console.log("📊 Parsed events after dedup:", finalEvents.length);

    const output = {
      scrapedAt: new Date().toISOString(),
      source: URL,
      eventCount: finalEvents.length,
      events: finalEvents
    };

    fs.writeFileSync(
      "calendar.json",
      JSON.stringify(output, null, 2),
      "utf-8"
    );

    console.log(`✅ Done. ${finalEvents.length} events saved`);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
