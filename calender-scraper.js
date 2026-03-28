import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

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

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    console.log("📦 HTML length:", html.length);

    const rows = html.split(/<tr[^>]*>/i);

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "Mars"; // from header

    const events = [];

    for (const row of rows) {
      const clean = row.replace(/\n/g, " ").trim();

      // 📅 DATE ROW
      if (/class=dag/i.test(clean)) {
        const dateMatch = clean.match(/<b[^>]*>(\d+)<\/b>/);
        const weekdayMatch = clean.match(/<font[^>]*>(.*?)<\/font>/);

        currentDate = dateMatch?.[1] || "";
        currentWeekday = weekdayMatch?.[1] || "";

        continue;
      }

      if (!currentDate) continue;

      // ⏱ TIME
      let startTime = "";
      let endTime = "";

      const timeRange = clean.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = clean.match(/>(\d{2}:\d{2})</);

      if (timeRange) {
        startTime = timeRange[1];
        endTime = timeRange[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

      // 👥 TEAM (first link before kal)
      let team = "Unknown";
      const teamMatch = clean.match(/href='[^']*GID=0'>([^<]+)<\/a>/);
      if (teamMatch) {
        team = teamMatch[1].trim();
      }

      // 📍 ACTIVITY (fixed regex)
      const activityMatch = clean.match(
        /<a[^>]*class\s*=\s*["']?[^"'>]*\bkal\b[^"'>]*["']?[^>]*>(.*?)<\/a>/i
      );

      if (!activityMatch) continue;

      const rawText = activityMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
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

      // ❌ Skip cancelled
      if (clean.toLowerCase().includes("inställd")) continue;

      events.push({
        date: `${currentWeekday} ${currentDate}`,
        month: currentMonth,
        startTime,
        endTime,
        team,
        location: location || "Unknown",
        type,
        title,
        opponent
      });
    }

    console.log("📊 Parsed events:", events.length);

    // 🔁 Deduplicate
    const unique = [];
    const seen = new Set();

    for (const e of events) {
      const key = `${e.date}-${e.startTime}-${e.team}-${e.location}-${e.opponent}`;

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
