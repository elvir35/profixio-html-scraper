# Match feed maintenance

The matches pipeline is SportAdmin public HTML -> this repository's `matches.json`
-> `h43-matches-api.vercel.app/api/matches` -> the H43 team pages.
The Vercel API reads the main-branch JSON; publishing a changed snapshot affects the live website.

## Parser contract

`match-parser.js` reads SportAdmin's `.sa-matches` card markup in DOM order.
It validates every card, date, weekday, time and result before accepting either source view.
Youth labels such as `Pojkar 11 - Födda 2015` normalize to the existing feed label `P11`.
Other group labels remain unchanged. The existing public record fields are preserved.
Internal event IDs deduplicate overlapping views by team; the played view wins.
No result or home/away identity is inferred from the fixture date.

## Failure behavior

Both upcoming and played pages must fetch and parse successfully before writing.
HTTP errors, changed/incomplete markup, conflicting duplicates and unverified empty pages
fail the run and retain the previous JSON byte-for-byte. Replacement uses a temporary
file in the same directory and an atomic rename. The workflow commits only after success.
There is deliberately no zero-card success path: SportAdmin's actual empty-season markup
has not been verified. An empty season currently needs investigation rather than an automatic wipe.
A retained snapshot can become stale; monitor failed scheduled runs and the `scrapedAt` field.

## Validation and operation

- `npm install`
- `npm test` (Node's built-in test runner; synthetic club-only fixtures)
- `npx playwright install chromium`
- `npm run scrape:matches`

The existing GitHub Actions job runs every six hours and now tests before scraping.
No additional services, secrets or Vercel deployment are needed for this parser repair.
Calendar scraping is unchanged.

The 2026-11-19 pre-publication check extracted 338 upcoming-view cards and 181
played-view cards, merging to 499 distinct fixtures. The existing youth API adapter
accepted the candidate for all 11 configured teams, including scores and chronological
next-match selection. F9 legitimately had no future match in this source at that check.
These are observation-time counts, not fixed expectations for future seasons.

Before publication, review the change and obtain the required production approval.
Publish the repaired parser/tests/workflow and a fresh validated JSON snapshot together,
then check raw GitHub, the Vercel API, and the youth API for the same feed progression.
Allow the existing bounded CDN/API caches to expire; verify both upcoming and played tabs.
If a later source change breaks extraction, pause the scraper workflow and preserve the
last valid snapshot while fixing the parser. Do not restore the old table-only parser,
which can replace valid data with an empty feed.


The logo repair adds `homeLogo` and `awayLogo`, preserving SportAdmin participant order. The legacy `logo` field remains the home shield for compatibility. Missing source images remain empty and generic SportAdmin shields remain generic; no club identity is guessed. The existing standalone Webnode block already reads both side-specific fields, so this additive API change needs no new embed version.
