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
        "Accept": "*/*",
        "Origin": "https://h43lund.web.sportadmin.se",
        "Referer": "https://h43lund.web.sportadmin.se/kalender/?ID=331251"
      },
      body: new URLSearchParams({
        ID: "331251"
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    // ✅ Fix encoding
    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    const events = [];

    const rows = html.split("<tr");

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "";

    for (const row of rows) {
      const clean = row.replace(/\n/g, " ").trim();

      // 📅 Month
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

      if (!currentDate) continue;

      // ⏱ Time
      let startTime = "";
      let endTime = "";

      const timeMatch = clean.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = clean.match(/\b(\d{2}:\d{2})\b/);

      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

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

        if (title.toLowerCase().includes("vs")) {
          opponent = title.split("vs")[1]?.trim() || "";
        }
      }

      // 👥 Team
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
        startTime,
        endTime,
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
