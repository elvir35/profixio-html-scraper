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

    // ✅ SAVE DEBUG FILE
    fs.writeFileSync("debug_calendar.html", html, "utf-8");

    console.log("💾 Saved debug_calendar.html");

    // 🔍 Quick debug checks
    console.log("Contains 'kal'?", html.includes("kal"));
    console.log("Contains '<tr'?", html.includes("<tr"));
    console.log("Contains 'dag'?", html.includes("dag"));

  } catch (err) {
    console.error("❌ Scraper failed:", err);
    process.exit(1);
  }
})();
