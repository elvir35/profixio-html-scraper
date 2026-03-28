import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp?ID=331251";

(async () => {
  try {
    console.log("➡️ Fetching calendar...");

    const res = await fetch(URL);

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    // ✅ FIX encoding (important!)
    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    // Save raw (optional debug)
    fs.writeFileSync("raw_calendar.html", html, "utf-8");

    // 🧠 PARSE
    const events = [];

    const rows = html.split("<tr");

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "";

    for (const row of rows) {
      const clean = row.replace(/\n/g, " ").trim();

      // 📅 Month detection
      const monthMatch = clean.match(/<b>(Januari|Februari|Mars|April|Maj|Juni|Juli|Augusti|September|Oktober|November|December)<\/b>/i);
      if (monthMatch) {
        currentMonth = monthMatch[1];
      }

      // 📅 Date row
      if (clean.includes('class="dag"')) {
        const dateMatch = clean.match(/<b>(\d+)<\/b>/);
        const weekdayMatch = clean.match(/<font[^>]*>(.*?)<\/font>/);

        currentDate = dateMatch?.[1] || "";
        currentWeekday = weekdayMatch?.[1] || "";

        continue;
      }

      // Skip if no date context
      if (!currentDate) continue;

      // 📍 Activity
      const activityMatch = clean.match(/class="kal"[^>]*>(.*?)<\/a>/);
      if (!activityMatch) continue;

      const rawText = activityMatch[1]
        .replace(/<[^>]+>/g, "")
        .trim();

      if (!rawText) continue;

      const lower = rawText.toLowerCase();

      let type = "";
      let location = "";
      let opponent = "";
      let title = "";

      // 🔴 Match
      if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";

        const parts = rawText.split(",");
        opponent = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      }

      // 🟦 Training
      else if (lower.includes("träning")) {
        type = "Träning";

        const parts = rawText.split(",");
        location = parts[1]?.trim() || "";
      }

      // 🟫 Other
      else {
        type = "Övrigt";

        const parts = rawText.split(",");
        title = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";

        if (title.toLowerCase().includes("vs")) {
          opponent = title.split("vs")[1]?.trim() || "";
        }
      }

      // 👥 Team (first link that is not .kal)
      let team = "Unknown";
      const teamMatch = clean.match(/<a[^>]*>(?!.*kal)(.*?)<\/a>/);
      if (teamMatch) {
        team = teamMatch[1].replace(/<[^>]+>/g, "").trim();
      }

      // ❌ Skip cancelled
      if (clean.toLowerCase().includes("inställd")) continue;

      events.push({
        date: `${currentWeekday} ${currentDate}`,
        month: currentMonth,
        team,
        location: location || "Unknown",
        type,
        title,
        opponent
      });
    }

    // 🔁 Deduplicate
    const unique = [];
    const seen = new Set();

    for (const e of events) {
      const key = `${e.date}-${e.team}-${e.location}-${e.opponent}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(e);
      }
    }

    const output = {
      scrapedAt: new Date().toISOString(),
      source: URL,
      eventCount: unique.length,
      events: unique
    };

    fs.writeFileSync("calendar.json", JSON.stringify(output, null, 2), "utf-8");

    console.log(`✅ Done. ${unique.length} events saved`);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
