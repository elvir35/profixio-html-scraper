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

    // 🔥 Extract ALL event rows (kal links)
    const matches = [...html.matchAll(/<a[^>]*class="kal"[^>]*>(.*?)<\/a>/gi)];

    console.log("📊 Found activity links:", matches.length);

    const events = [];

    for (const match of matches) {
      const raw = match[1].replace(/<[^>]+>/g, "").trim();

      if (!raw) continue;

      const lower = raw.toLowerCase();

      let type = "";
      let location = "";
      let opponent = "";
      let title = "";

      if (lower.includes("borta") || lower.includes("hemma")) {
        type = "Match";
        const parts = raw.split(",");
        opponent = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      } else if (lower.includes("träning")) {
        type = "Träning";
        const parts = raw.split(",");
        location = parts[1]?.trim() || "";
      } else {
        type = "Övrigt";
        const parts = raw.split(",");
        title = parts[0]?.trim() || "";
        location = parts[1]?.trim() || "";
      }

      events.push({
        raw,
        type,
        location,
        opponent,
        title
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
