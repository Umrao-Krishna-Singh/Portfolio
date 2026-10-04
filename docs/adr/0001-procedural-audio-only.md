# Procedural audio only, zero audio files

Status: accepted (2026-10-03).

All sound — thuds, parchment friction, ember crackle, tavern drone — is synthesised at runtime by `FantasySoundEngine` (Web Audio API). We rejected stock/MP3 audio because external files add download weight, licensing surface, and autoplay complexity, at the cost of owning a small synth engine. No `.mp3`/`.wav` may be added to the project; if a future sound cannot be synthesised convincingly, this ADR must be revisited, not quietly bypassed.
