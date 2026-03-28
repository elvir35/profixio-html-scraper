for (const match of matches) {
  const index = match.index;

  const rawText = match[1]
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();

  if (!rawText) continue;

  // 🔍 Look back limited window (important!)
  const before = html.slice(Math.max(0, index - 2000), index);

  // ✅ DATE (closest one)
  const dateMatches = [...before.matchAll(/class=dag[\s\S]*?<b[^>]*>(\d+)<\/b>[\s\S]*?<font[^>]*>(.*?)<\/font>/gi)];
  const lastDate = dateMatches.pop();

  const currentDate = lastDate?.[1] || "";
  const currentWeekday = lastDate?.[2] || "";

  // ✅ TIME (from td before)
  const timeMatches = [...before.matchAll(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g)];
  const lastTime = timeMatches.pop();

  let startTime = "";
  let endTime = "";

  if (lastTime) {
    startTime = lastTime[1];
    endTime = lastTime[2];
  }

  // ✅ TEAM (last link before event)
  const teamMatches = [...before.matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
  const lastTeam = teamMatches.pop();

  let team = lastTeam?.[1]?.trim() || "Unknown";

  // ❗ Remove garbage matches
  if (team.includes("kal") || team.includes("javascript")) {
    team = "Unknown";
  }

  // 📍 TYPE LOGIC (unchanged)
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
