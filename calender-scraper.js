function extractExtraInfo(row, $) {
  let meetingTime = "";
  let info = "";

  // Find hidden detail block
  const details = row.find(".calAkt2");

  if (!details.length) return { meetingTime, info };

  // 🔍 Extract meeting time
  const meetingText = details
    .find("div")
    .filter((_, el) => $(el).text().includes("Samling"))
    .first()
    .text()
    .trim();

  if (meetingText) {
    const match = meetingText.match(/Samling:\s*(\d{2}:\d{2})/);
    if (match) {
      meetingTime = match[1];
    }
  }

  // 🔍 Extract extra info (exclude "Samling")
  const infoBlocks = details.find("div").filter((_, el) => {
    const text = $(el).text().trim();
    return text && !text.includes("Samling");
  });

  info = infoBlocks
    .map((_, el) => $(el).text().trim())
    .get()
    .join(" ");

  return { meetingTime, info };
}
