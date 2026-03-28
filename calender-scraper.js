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

    // ✅ FIXED regex
    const matches = [
      ...html.matchAll(/<a[^>]*class=["'][^"']*kal[^"']*["'][^>]*>(.*?)<\/a>/gi)
    ];

    console.log("📊 Found activity links:", matches.length);

    const events = [];

    for (const match of matches) {
      const raw = match[1].replace(/<[^>]+>/g, "").trim();

      if (!raw) continue;

      events.push(raw);
    }

    console.log("📊 Parsed events:", events.length);

    fs.writeFileSync("calendar.json", JSON.stringify(events, null, 2), "utf-8");

    console.log("✅ Done");

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
