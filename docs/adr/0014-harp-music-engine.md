# Music engine: composed G-mixolydian harp tune (baseline for iteration)

Status: accepted (2026-10-05).

This ADR is the single log for the site's music. ADR-0013 carries the history (drone rejected → generative harp → dorian organum → composed tune); this one pins the accepted baseline and receives every future iteration as an appended Update, so the tune can keep evolving without its specification living in chat history.

The implementation (all in `kindleMusic`, prototype/app.js): 100% procedural, zero files (ADR-0001), gesture-gated and kindle-gated (ADR-0002) with localStorage restore lighting it on the first pointerdown. A Karplus-Strong pluck synth builds one cached buffer per rounded frequency on first use; every note is a playback of that buffer through a shared harp bus (lowpass 3100 Hz, gut-string dark, gain 0.5, reverb send 0.45). Behind it, the candle-fire bed: a looped 2.4s noise buffer low-passed to 480 Hz at gain 0.009, breathing on a 0.13 Hz LFO — noise, not the tonal hum the user rejected.

The tune is COMPOSED, not wandered: G mixolydian over a fixed 13-note scale table, in a repeating A–A′–B–cadence form (PHRASE_A / PHRASE_A2 / PHRASE_B / PHRASE_CAD, each an array of `[scaleIndex, lilt]` pairs). Rhythm is a 6/8 lilt — long (dotted) notes ~0.40s, short (quaver) notes ~0.20s, each with small random jitter — so the tune dances instead of marching. A two-voice organum fourth below rides every note (velocity ×0.38, +12ms); notes with no fourth below them get the low final instead. The cadence closes on the low final with the open fifth underneath. The scheduler keeps ~1.3s of look-ahead on a 280ms poll and breathes between phrases (0.5–0.8s; 1.6–2.5s after the cadence) so the form never loops audibly.

User verdict (round 6 recording session): "The music is much better this time and it can work as it is, but we should keep iterating to get something better if possible." Policy: this baseline is accepted; iterations are small, reversible changes logged below, and the CC0-track fallback (ADR-0004, researched in docs/research/) stays available but untriggered. Consequence: the tune is code, not data — any change is a diff in `kindleMusic`, and the pluck cache grows only if an iteration introduces new pitches.

## Update (2026-10-05, round 6: phrase dynamics and cadence ritardando)

First iteration on the accepted baseline, deliberately conservative — the pitches, form, lilt and organum are untouched. Two performance-practice layers: (1) a per-phrase dynamic contour (A 0.85×, A′ 0.9×, B 1.12×, cadence 0.9×) so the form arches instead of sitting at one loudness; (2) the cadence phrase slows ~18% (long/short durations ×1.18) — a ritardando into the close, which medieval performance does and a metronomic loop does not. Both are single-point changes in the step loop, trivially revertible if the ear disagrees.

## Update (2026-10-15, Issue #18: The Bard's Tale master gain re-staging)

To balance the background harp and flute recording (*The Bard's Tale*) against ambient candle breathing and procedural interaction sounds, master track gain is reduced by 20% from 0.85 to 0.68 with a 1.6s smooth exponential fade-in upon breaking the arcane wax seal (ADR-0017, ADR-0020).
