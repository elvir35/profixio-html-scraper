import fetch from "node-fetch";
import fs from "fs";

const URL = "https://h43lund.web.sportadmin.se/kalender/ajaxKalender.asp?ID=331251";

(async () => {
  console.log("➡️ Fetching calendar directly...");

  const res = await fetch(URL);
  const html = await res.text();

  // Save raw for inspection
  fs.writeFileSync("raw_calendar.html", html);

  console.log("✅ Saved raw calendar HTML");

  // Optional: parse with regex or cheerio later
})();
