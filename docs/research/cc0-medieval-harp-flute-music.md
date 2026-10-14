# CC0 Western-Medieval Background Music Candidates

Asset reference for verified **CC0** (public domain equivalent, zero attribution required per [ADR-0004](../adr/0004-cc0-only-assets.md)) medieval background music tracks.

## 1. Verified CC0 Tracks (OpenGameArt)

All tracks verified directly against author license declarations on their respective hosting pages.

| Track | Artist | Duration | Format | Character & Instrumentation | Dedicated Loop File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [**The Bard's Tale**](https://opengameart.org/content/medieval-the-bards-tale) | RandomMind | 2:39 | MP3 192 kbps | Lute + flute, peaceful medieval folk *(Adopted for kindle)* | Yes (`Loop_The_Bards_Tale.wav`) |
| [**King's Feast**](https://opengameart.org/content/medieval-kings-feast) | RandomMind | 2:10 | MP3 320 kbps | Upbeat tavern feast | Yes (`Loop_Kings_Feast.wav`) |
| [**The Old Tower Inn**](https://opengameart.org/content/medieval-the-old-tower-inn) | RandomMind | 1:45 | MP3 192 kbps | Calm inn atmosphere | Yes (`Loop_The_Old_Tower_Inn.wav`) |
| [**Market Day**](https://opengameart.org/content/medieval-market-day) | RandomMind | 2:20 | MP3 320 kbps | Lively village market | Yes (`Loop_Market_Day.wav`) |
| [**A New Town**](https://opengameart.org/content/a-new-town-rpg-theme) | cynicmusic | 1:02 | MP3 ~98 kbps (32 kHz) | Minimal solo harp (Garritan Harps) | No (short loop) |

*Notes on Quality*:
- RandomMind tracks use sampled medieval acoustic instruments with clean loop cuts.
- `A New Town` is the only verified CC0 solo harp piece, but is restricted to 32 kHz sample rate.

## 2. Incompatible / Excluded Sources

The following sources were audited and rejected due to license restrictions or operational status:

- **FreePD.com**: Permanently closed in 2025; available only through historical web archive mirrors.
- **Alexander Nakarada (CreatorChords / Serpent Sound)**: All tracks licensed under **CC-BY 4.0** (violates zero-attribution ADR-0004 constraint).
- **Frank Schröter & Kevin MacLeod**: All tracks licensed under **CC-BY 4.0**.
- **Pixabay / Free-Stock-Music / BBC RemArc**: Proprietary "royalty-free" licenses with usage restrictions; not public domain.
- **Musopen**: Classical repertoire only; downloads are account-gated.
- **Freesound**: CC0 filter yields individual instrument samples and sound effects, not continuous BGM compositions.

## 3. Web Delivery & Integration Architecture

- **Format**: Master WAV/MP3 files must be transcoded to Opus mono (~25 kbps CBR) via `ffmpeg`:
  ```bash
  ffmpeg -i source.wav -c:a libopus -b:a 25k -ac 1 output.opus
  ```
  Reduces total asset weight to <500 KB while preserving acoustic transient clarity.
- **Playback Lifecycle**:
  - Gated behind first user gesture and kindle toggle ([ADR-0002](../adr/0002-silent-first-audio-entry.md)).
  - Zero network bytes fetched until kindle activation.
  - Seamless wrapping via `AudioBufferSourceNode.loop = true`.
  - Fallback to procedural Karplus-Strong harp engine ([ADR-0014](../adr/0014-harp-music-engine.md)) if network fetch or decoding fails.
