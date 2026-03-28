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

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    console.log("📦 HTML length:", html.length);

    // ✅ Find all events (handles class=kal without quotes)
    const matches = [
      ...html.matchAll(
        /<a[^>]*class\s*=\s*["']?[^"'>]*\bkal\b[^"'>]*["']?[^>]*>(.*?)<\/a>/gi
      )
    ];

    console.log("📊 Found raw events:", matches.length);

    const events = [];

    for (const match of matches) {
      const index = match.index;

      const rawText = match[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .trim();

      if (!rawText) continue;

      // 🔍 Look backwards (limited window)
      const before = html.slice(Math.max(0, index - 2500), index);

      // ✅ DATE (robust)
      const dateMatches = [
        ...before.matchAll(
          /class\s*=\s*["']?dag["']?[\s\S]*?<b[^>]*>(\d+)<\/b>[\s\S]*?<font[^>]*>(.*?)<\/font>/gi
        )
      ];
      const lastDate = dateMatches.pop();

      const currentDate = lastDate?.[1] || "";
      const currentWeekday = lastDate?.[2] || "";

      // ✅ TIME (supports single + range)
      const timeMatches = [
        ...before.matchAll(/(\d{2}:\d{2})(?:\s*-\s*(\d{2}:\d{2}))?/g)
      ];

      let startTime = "";
      let endTime = "";

      if (timeMatches.length) {
        const lastTime = timeMatches.pop();
        startTime = lastTime[1] || "";
        endTime = lastTime[2] || "";
      }

      // ✅ TEAM (last relevant link before event)
      const teamMatches = [
        ...before.matchAll(/<a[^>]*>([^<]+)<\/a>/g)
      ];

      let team = "Unknown";

      for (let i = teamMatches.length - 1; i >= 0; i--) {
        const t = teamMatches[i][1].trim();

        if (
          t &&
          !t.toLowerCase().includes("kal") &&
          !t.toLowerCase().includes("javascript") &&
          t.length < 50
        ) {
          team = t;
          break;
        }
      }

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
      if (rawText.toLowerCase().includes("inställd")) continue;

      events.push({
        date: `${currentWeekday} ${currentDate}`.trim(),
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
