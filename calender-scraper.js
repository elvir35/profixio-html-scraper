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

    // 🔥 Find ALL event links first (this we KNOW works now)
    const eventRegex = /<a[^>]*class\s*=\s*[^>]*\bkal\b[^>]*>(.*?)<\/a>/gi;

    const matches = [...html.matchAll(eventRegex)];

    console.log("📊 Found raw events:", matches.length);

    const events = [];

    for (const match of matches) {
      const fullMatch = match[0];
      const index = match.index;

      // 🧠 Extract text
      const rawText = match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (!rawText) continue;

      // 🔍 LOOK BACKWARDS for nearest date
      const before = html.slice(0, index);

      const dateMatch = before.match(/class=dag[\s\S]*?<b[^>]*>(\d+)<\/b>[\s\S]*?<font[^>]*>(.*?)<\/font>/i);

      let currentDate = dateMatch?.[1] || "";
      let currentWeekday = dateMatch?.[2] || "";

      // ⏱ TIME
      const timeMatch = fullMatch.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = fullMatch.match(/(\d{2}:\d{2})/);

      let startTime = "";
      let endTime = "";

      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

      // 👥 TEAM (look nearby)
      const teamMatch = before.match(/href='[^']*GID=0'>([^<]+)<\/a>[^<]*$/i);
      let team = teamMatch?.[1]?.trim() || "Unknown";

      // 📍 TYPE + LOCATION
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

      events.push({
        date: `${currentWeekday} ${currentDate}`,
        month: "Mars",
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

    fs.writeFileSync("calendar.json", JSON.stringify(events, null, 2), "utf-8");

    console.log("✅ Done");

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
