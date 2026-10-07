# CC0 western-medieval harp & flute/recorder background music

Research notes, 2026-10-05. Question: does a **CC0** (no attribution, public-domain-equivalent — the ADR-0004 asset rule) recorded track exist for a western-medieval **harp** and **flute/recorder** background soundtrack, suitable to loop on the site?

Context: the procedural harp engine (ADR-0013 updates, ADR-0014) is accepted as the baseline; the CC0-track fallback was explicitly deferred until the user listens. This doc is that fallback's menu. **Nothing was shipped** — all candidates are downloaded to `.tmp/research-audio/` for listening only.

## Bottom line

- Verified-CC0 pickings are thin but real. One artist — **RandomMind** on OpenGameArt — publishes a coherent "Medieval:" series, every checked page CC0, several with dedicated seamless-loop files. Closest instrument matches to the ask: **The Bard's Tale** (lute + flute) and **A New Town** (solo harp).
- A **recorder-led** CC0 background track was not found at any reputable source. If that sound is wanted, realistic routes are (a) synthesizing a flute layer in the existing engine, or (b) amending ADR-0004 to allow CC-BY with an attribution line (Nakarada et al. — see exclusions).
- **FreePD.com is permanently closed** (on-page notice, 2008–2025; verified live and via the Dec 2025 Wayback capture). CC0 on already-downloaded files survives; the site is no longer a source.

## Method

License read from each track's **own hosting page** (the license field is the primary source) — no aggregator trusted second-hand. All auditioned files were downloaded and measured with ffprobe; durations below are measured, not claimed. Sources swept: OpenGameArt (incl. per-page verification), Freesound (CC0-filtered), Wikimedia Commons, FreePD (live + Wayback), Free Music Archive, CreatorChords/Serpent Sound, pixelsphere.org, Musopen (blocked — see exclusions).

## Verified CC0 candidates

| Track | Author | Measured length | Format | Style / instruments | Dedicated loop file |
|---|---|---|---|---|---|
| [Medieval: The Bard's Tale](https://opengameart.org/content/medieval-the-bards-tale) | RandomMind | 2:39 | MP3 192 kbps 44.1 kHz | Lute + flute, major-key medieval folk, peaceful | Yes (`Loop_The_Bards_Tale.wav`, 10.2 MB) |
| [Medieval: King's Feast](https://opengameart.org/content/medieval-kings-feast) | RandomMind | 2:10 | MP3 320 kbps | Tavern/feast, upbeat | Yes (`Loop_Kings_Feast.wav`, 14.2 MB) |
| [Medieval: The Old Tower Inn](https://opengameart.org/content/medieval-the-old-tower-inn) | RandomMind | 1:45 | MP3 192 kbps | Tavern/inn, calm | Yes (`Loop_The_Old_Tower_Inn.wav`, 8.8 MB) |
| [A New Town (RPG Theme)](https://opengameart.org/content/a-new-town-rpg-theme) | cynicmusic | 1:02 | MP3 ~98 kbps **32 kHz** | Solo harp (Garritan Harps), "ethereal, minimal, regal" | No (short; loops acceptably) |
| [Medieval: Exploration](https://opengameart.org/content/medieval-exploration) | RandomMind | 3:56 | MP3 320 kbps | Menus/exploration | No |
| [Medieval: Market Day](https://opengameart.org/content/medieval-market-day) | RandomMind | 2:20 (loop cut 1:05) | MP3 320 kbps | Market/village | Yes (`Loop_Market_Day.mp3/.wav`) |
| [Medieval: Harvest Season](https://opengameart.org/content/medieval-harvest-season) | RandomMind | not measured (file URL 404'd at scrape time — download from the page) | — | Seasonal/village | No |

Every checked RandomMind page states CC0 explicitly; attribution explicitly not required (the author says credits "appreciated but not required"). The same series also contains Victory Theme, Defeat Theme, Battle, Rejoicing, Minstrel Dance (+ chiptune variants) — scene music, not BGM ([artist page](https://opengameart.org/users/randommind)).

Audition copies live in `.tmp/research-audio/` (7 files; untracked, .tmp only).

**Caveats worth knowing before judging:**
- `A New Town` is the only verified-CC0 **solo harp** found anywhere, but it is 32 kHz / ~98 kbps — audibly lower-fi; fine under a soundscape, imperfect as the lead voice.
- The RandomMind tracks are sampled-orchestra "fantasy tavern" (they sit closer to RPG soundtrack than to historically informed performance).

## Special mention (CC0, provenance caveat)

- **"Connecting Rainbows"** — a Celtic-harp piece, CC0, catalogued on FreePD's World page ([Dec 2024 capture](https://web.archive.org/web/20241215182328/https://freepd.com/world.php)). FreePD has since closed, so obtain it via archive mirrors and confirm the artist credit before shipping.

## Excluded sources — the useful negative results

- **FreePD.com** — closed (notice: "after 17 years… permanently closed", 2008–2025; seen live and in the [Dec 29 2025 capture](https://web.archive.org/web/20251229145249/https://freepd.com/)). Its catalog was all-CC0; mirrors only now.
- **Alexander Nakarada** (CreatorChords / ex-Serpent Sound) — the largest free medieval/renaissance catalog anywhere — **CC-BY 4.0**, attribution required → fails ADR-0004. Same for **Frank Schröter** (filmmusic.io; e.g. ["Medieval Dream"](https://commons.wikimedia.org/wiki/File:Medieval_Dream_by_Frank_Schr%C3%B6ter.ogg), CC-BY 4.0) and **incompetech** (Kevin MacLeod, CC-BY 4.0; his CC0 releases died with FreePD).
- **Pixabay / free-stock-music / zapsplat / BBC RemArc** — custom "royalty-free" or non-commercial licenses → fail CC0-only.
- **Musopen** — real recorded harp exists, but downloads are account-gated (site 403s scraping), licenses vary per track, and the repertoire is classical, not western-medieval.
- **Freesound CC0 filter** — sample-grade only: blues harp (harmonica), synth harps, a Native-American-style flute loop; no western-medieval BGM.
- **pixelsphere.org** (The Cynic Project) — "100% free" soundtrack but **no explicit license statement on the site** (paid licensing offered). Only their OGA-published track (A New Town, verified CC0 on its OGA page) is safe.

## If one is adopted — integration notes (decision not yet made)

- Keep gesture-gating + mute-first (ADR-0002) and the kindle hook; the track would replace or sit under the procedural harp per ADR-0013's fallback clause — log the choice in an ADR-0013/0014 update section.
- Re-encode to Ogg Vorbis (~q4) for payload: e.g. Bard's Tale 3.8 MB MP3 → ~1.5–2 MB Ogg; cache-bust `?v=N` like other assets.
- Loop from the dedicated `Loop_*` WAVs (built seamless), `loop=true` on the source node.
- CC0 needs no attribution; still record source URLs in the site credits for provenance (good practice, not obligation).

## Sources

Track pages: [Bard's Tale](https://opengameart.org/content/medieval-the-bards-tale) · [King's Feast](https://opengameart.org/content/medieval-kings-feast) · [Old Tower Inn](https://opengameart.org/content/medieval-the-old-tower-inn) · [A New Town](https://opengameart.org/content/a-new-town-rpg-theme) · [Exploration](https://opengameart.org/content/medieval-exploration) · [Market Day](https://opengameart.org/content/medieval-market-day) · [Harvest Season](https://opengameart.org/content/medieval-harvest-season) · [RandomMind on OGA](https://opengameart.org/users/randommind) · [cynicmusic on OGA](https://opengameart.org/users/cynicmusic)
Site/licensing evidence: [FreePD live (closure notice)](https://freepd.com/) · [FreePD Dec 2025 capture](https://web.archive.org/web/20251229145249/https://freepd.com/) · [FreePD World page, Dec 2024 capture](https://web.archive.org/web/20241215182328/https://freepd.com/world.php) · [Medieval Dream on Commons (CC-BY example)](https://commons.wikimedia.org/wiki/File:Medieval_Dream_by_Frank_Schr%C3%B6ter.ogg) · [pixelsphere.org](https://pixelsphere.org/) · [Freesound CC0 harp search](https://freesound.org/search/?q=harp+loop&f=license%3A%22Creative+Commons+0%22) · [Freesound CC0 medieval flute search](https://freesound.org/search/?q=medieval+flute+loop&f=license%3A%22Creative+Commons+0%22)
