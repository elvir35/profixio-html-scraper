import fs from "fs";
import cheerio from "cheerio";

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

    const $ = cheerio.load(html);

    const events = [];

    let currentDate = "";
    let currentWeekday = "";
    let currentMonth = "Mars";

    $("tr").each((i, el) => {
      const row = $(el);

      // 📅 DATE ROW
      if (row.hasClass("dag")) {
        currentDate = row.find("b").text().trim();
        currentWeekday = row.find("font").text().trim();
        return;
      }

      if (!currentDate) return;

      // 📍 EVENT
      const activityEl = row.find("a.kal");

      if (!activityEl.length) return;

      const rawText = activityEl.text().trim();
      if (!rawText) return;

      // ⏱ TIME
      let startTime = "";
      let endTime = "";

      const timeText = row.text();

      const timeMatch = timeText.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
      const singleTime = timeText.match(/\b(\d{2}:\d{2})\b/);

      if (timeMatch) {
        startTime = timeMatch[1];
        endTime = timeMatch[2];
      } else if (singleTime) {
        startTime = singleTime[1];
      }

      // 👥 TEAM (first link that is not kal)
      let team = "Unknown";
      row.find("a").each((i, a) => {
        const txt = $(a).text().trim();

        if (!$(a).hasClass("kal") && txt) {
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

      // ❌ Skip cancelled
      if (rawText.toLowerCase().includes("inställd")) return;

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
    });

    console.log("📊 Parsed events:", events.length);

    const output = {
      scrapedAt: new Date().toISOString(),
      source: URL,
      eventCount: events.length,
      events
    };

    fs.writeFileSync("calendar.json", JSON.stringify(output, null, 2));

    console.log(`✅ Done. ${events.length} events saved`);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
