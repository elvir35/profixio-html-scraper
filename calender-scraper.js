function parseCalendar(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const rows = doc.querySelectorAll("tr");

  const events = [];
  let currentDate = null;

  rows.forEach((row) => {
    const text = row.innerText.trim();

    // ✅ 1. Detect DATE rows (VERY IMPORTANT FIX)
    const dateMatch = text.match(/(mån|tis|ons|tor|fre|lör|sön)\s+\d{1,2}/i);
    if (dateMatch) {
      currentDate = dateMatch[0].toLowerCase();
      return; // move to next row
    }

    // ❌ If no date yet → skip
    if (!currentDate) return;

    // ✅ 2. Detect event rows (must contain time + team)
    const timeMatch = text.match(/\d{2}:\d{2}/);
    if (!timeMatch) return;

    const time = timeMatch[0];

    // Extract end time if exists
    const endTimeMatch = text.match(/\d{2}:\d{2}\s*-\s*(\d{2}:\d{2})/);
    const endTime = endTimeMatch ? endTimeMatch[1] : "";

    // Extract team
    const teamMatch = text.match(/([A-ZÅÄÖa-zåäö0-9\s\/]+)\s»/);
    const team = teamMatch ? teamMatch[1].trim() : "";

    // Extract type
    const type = text.includes("Träning")
      ? "Träning"
      : text.includes("Match")
      ? "Match"
      : "Övrigt";

    // Extract location (after comma)
    let location = "";
    const locMatch = text.match(/,\s*([^,(]+)/);
    if (locMatch) location = locMatch[1].trim();

    // Extract opponent (for matches)
    let opponent = "";
    const oppMatch = text.match(/»\s*(.*?)\s*,/);
    if (oppMatch) opponent = oppMatch[1].trim();

    // ✅ 3. Push with GUARANTEED correct date
    events.push({
      date: currentDate,
      month: "MARS 2026",
      startTime: time,
      endTime,
      team,
      location,
      type,
      title: "",
      opponent,
    });
  });

  return events;
}
