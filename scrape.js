const matches = await page.evaluate((status) => {
  const rows = Array.from(document.querySelectorAll("tr"));

  const results = [];

  let currentDate = "";
  let currentMonth = "";

  rows.forEach(row => {
    const text = row.innerText.trim();

    // 🔥 FIX 1: Detect MONTH correctly (dynamic)
    const monthCandidate = row.querySelector("b");
    if (
      monthCandidate &&
      /^[A-ZÅÄÖ]+\s+\d{4}$/.test(monthCandidate.innerText.trim())
    ) {
      currentMonth = monthCandidate.innerText.trim();
      return;
    }

    // 🔥 FIX 2: Detect DATE row
    if (row.className && row.className.includes("dag")) {
      const dayEl = row.querySelector("b");
      const weekdayEl = row.querySelector("font");

      const day = dayEl ? dayEl.innerText.trim() : "";
      const weekday = weekdayEl ? weekdayEl.innerText.trim() : "";

      currentDate = `${weekday} ${day}`.trim();
      return;
    }

    // --- MATCH LINK ---
    const link = row.querySelector("a[href*='AID=']");
    if (!link) return;

    const matchText = link.innerText;
    if (!matchText.includes(" - ")) return;

    const [home, away] = matchText.split(" - ");

    // --- TIME ---
    const timeMatch = text.match(/\d{2}:\d{2}/);
    const time = timeMatch ? timeMatch[0] : "";

    // --- TEAM ---
    const teamLink = row.querySelector("a[href*='ID=']");
    const team = teamLink ? teamLink.innerText.trim() : "";

    // --- HALL ---
    let hall = "";
    const hallContainer = row.querySelector("td:nth-child(2)");
    if (hallContainer) {
      const parts = hallContainer.innerText.split(",");
      if (parts.length > 1) {
        hall = parts[1].trim();
      }
    }

    // --- LOGO ---
    const img = row.querySelector("img");
    const logo = img ? img.src : "";

    // --- SCORE ---
    let score = "";

    if (status === "played") {
      const scoreCell = row.querySelector("td[align='right']");

      if (scoreCell) {
        const raw = scoreCell.innerText.trim();

        const match = raw.match(/^(\d+)\s*-\s*(\d+)$/);

        if (match) {
          score = `${match[1]} - ${match[2]}`;
        }
      }
    }

    results.push({
      team,
      hall,
      time,
      date: currentDate,
      month: currentMonth, // ✅ NOW CORRECT
      home: home.trim(),
      away: away.trim(),
      score,
      logo,
      status
    });
  });

  return results;
}, status);
