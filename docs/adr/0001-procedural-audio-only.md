# Procedural audio only, zero audio files

Status: accepted (2026-10-03).

All sound — thuds, parchment friction, ember crackle, tavern drone — is synthesised at runtime by `FantasySoundEngine` (Web Audio API). We rejected stock/MP3 audio because external files add download weight, licensing surface, and autoplay complexity, at the cost of owning a small synth engine. No `.mp3`/`.wav` may be added to the project; if a future sound cannot be synthesised convincingly, this ADR must be revisited, not quietly bypassed.

## Update (2026-10-15, Issue #18: CC0 audio file permitted for background score)

ADR-0001 is revisited per its clause: CC0 Opus audio (`The_Bards_Tale_v3.opus`, 482 KB) is permitted for the background musical theme, wired behind the wax seal activation and Kindle toggle (ADR-0017, ADR-0020). Procedural synthesis remains mandatory for all physical interactive SFX (thuds, parchment friction, ember crackle, and the `sealCrack` fracture).
