import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp";

(async () => {
  try {
    console.log("➡️ Fetching calendar (with headers)...");

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

    const buffer = Buffer.from(await res.arrayBuffer());
    const html = buffer.toString("latin1");

    fs.writeFileSync("raw_calendar.html", html, "utf-8");

    console.log("✅ Got HTML length:", html.length);

    // 🧪 sanity check
    if (!html.includes("<tr")) {
      throw new Error("❌ No table rows found — still wrong response");
    }

    // --- SIMPLE COUNT TEST ---
    const rowCount = (html.match(/<tr/g) || []).length;
    console.log("📊 Rows found:", rowCount);

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
