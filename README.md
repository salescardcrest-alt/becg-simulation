# BECG CSR Boardroom Challenge

A classroom simulation where teams play through six CSR-compliance boardroom
decisions (Section 135, FY 2022–23 data). Each team joins on its own device
with a unique code and submits its own answers; the facilitator runs the
round timer, locks each round, and reveals scoring from an Admin Panel.

## Pages

- `csr-boardroom.html` — facilitator/organizer screen (setup, round control,
  Admin Panel, scoreboard, team access codes).
- `csr-team.html` — team join page. Teams open this on their own
  phone/laptop, enter their code, and submit answers.

## How it works

Game state (teams, codes, answers, round, timer, results) is stored
server-side in Upstash Redis via `api/csr.js`, polled by both pages every
few seconds so every device stays in sync. The correct answers and scoring
logic live only in `csr-answer-key.js`, which is loaded by the facilitator
page and never shipped to the team page.

## Deploy (Vercel)

1. Import this repo into Vercel.
2. In the Vercel project's **Storage** tab, connect an Upstash Redis
   database (same as used by the Matrix Mystery Mania project).
3. Deploy. Share the facilitator URL (`/csr-boardroom.html`) with yourself
   and the team URL (`/csr-team.html`) with participants.

No build step — this is static HTML/CSS/JS plus two serverless functions
under `api/`.
