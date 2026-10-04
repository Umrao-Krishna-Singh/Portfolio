# Agent Guidelines & Project Overview

## Project Overview
- **Project Name**: Medieval Fantasy / Adventure Portfolio
- **Archetype**: Scribe's Tome & Adventurer's Tabletop
- **Key Experience Narrative**:
  - Atmospheric candlelit scholar's desk rendered in 3D (Three.js)
  - Loader with glowing runes transitioning to `[ ENTER THE REALM ⚔️ ]` CTA
  - User interaction unlocks browser `AudioContext` with leather/wood impact thud
  - Vertical parchment scroll unwraps with procedural paper friction audio
  - Camera zooms smoothly into reading position
  - Smoldering ember text reveals cooling into dark sepia calligraphic ink
  - Continuous vertical scroll through project case studies and technical proficiencies
  - Dynamic camera zoom-out to full desk view when reaching bottom of parchment
- **Specification Blueprint**: [`medieval_fantasy_portfolio_blueprint.md`](./medieval_fantasy_portfolio_blueprint.md)
- **Audio Strategy**: 100% Procedural Native Web Audio API (zero external MP3/audio assets)

---

## Core Rules

### 1. Git Commit Policy
- **NEVER run `git commit` without explicit user permission.**
- All Git commits must be explicitly requested or approved by the user before executing.

### 2. Dependency & Supply Chain Security Policy
- **NEVER install new packages, libraries, tools, or dependencies without explicit user permission.**
- **NEVER update or bump versions of existing packages or libraries without explicit user permission.**
- Proactively protect the project against supply-chain vulnerabilities and unauthorized package execution.
