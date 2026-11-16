const API_URL = "/api/csr";
const POLL_MS = 2500;
const SESSION_KEY = "csrBoardroomTeamCode";

let game = null;
let teamIndex = -1;
let teamCode = null;
let submittedThisRound = false;
let timerInterval = null;
let pollInterval = null;
const $ = (id) => document.getElementById(id);

async function apiGet() {
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not reach the challenge server.");
  return res.json();
}

async function apiPost(payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function setActiveView(viewId) {
  ["loginView", "waitingView", "teamRoundView", "teamResultView", "teamFinalView"].forEach((id) => {
    $(id).hidden = id !== viewId;
  });
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function ensureTimerTick() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = game && game.timerEndAt ? setInterval(updateTimerDisplay, 250) : null;
}

function updateTimerDisplay() {
  if (!game || !$("teamRoundTimer")) return;
  const seconds = game.timerEndAt
    ? Math.max(0, Math.ceil((game.timerEndAt - Date.now()) / 1000))
    : game.timerRemaining;
  $("teamRoundTimer").textContent = formatTime(seconds);
  $("teamRoundTimer").classList.toggle("warn", seconds <= 120 && seconds > 30);
  $("teamRoundTimer").classList.toggle("danger", seconds <= 30);
}

function renderAnswerArea() {
  const round = ROUNDS[game.currentRound];
  const existing = game.answers[game.currentRound][teamIndex];
  if (round.options) {
    $("teamAnswerArea").innerHTML = `<select class="team-answer-select" id="teamAnswerInput" aria-label="Your answer"><option value="">Select an answer</option>${round.options.map((option, optionIndex) => `<option value="${"ABCD"[optionIndex]}"${existing === "ABCD"[optionIndex] ? " selected" : ""}>${"ABCD"[optionIndex]} — ${escapeHtml(option)}</option>`).join("")}</select>`;
  } else {
    $("teamAnswerArea").innerHTML = `<input class="number-answer" id="teamAnswerInput" type="number" min="0" step="0.01" value="${escapeHtml(existing)}" placeholder="Rs crore (e.g. 27.00)" aria-label="Your answer">`;
  }
}

function renderRoundView() {
  const round = ROUNDS[game.currentRound];
  $("teamRoundNumber").textContent = `ROUND ${String(game.currentRound + 1).padStart(2, "0")} / 0${ROUNDS.length}`;
  $("teamRoundProgress").innerHTML = ROUNDS.map((_, index) =>
    `<span class="progress-segment${index < game.currentRound ? " done" : index === game.currentRound ? " active" : ""}"></span>`
  ).join("");
  $("teamNameLabel2").textContent = game.teams[teamIndex];
  $("teamRoundTitle").textContent = round.title;
  $("teamRoundQuestion").textContent = round.question;
  $("teamRoundClue").textContent = round.clue;
  renderAnswerArea();
  const already = Boolean(game.answers[game.currentRound][teamIndex]);
  $("teamSubmitStatus").textContent = already ? "Answer submitted. You can change it until the round is locked." : "Not submitted yet.";
  updateTimerDisplay();
  setActiveView("teamRoundView");
}

function renderResultView() {
  const result = game.results[game.currentRound][teamIndex];
  $("teamResultTitle").textContent = ROUNDS[game.currentRound].title;
  $("teamResultBody").innerHTML = `<tr><td>${result.points}</td><td>${result.trust > 0 ? "+" : ""}${result.trust}</td><td>${result.lives.toLocaleString("en-IN")}</td></tr>`;
  setActiveView("teamResultView");
}

function renderCurrentView() {
  if (!game.started) {
    $("waitingMessage").textContent = "The challenge hasn’t started yet. Stay on this screen — it will update automatically.";
    $("teamNameLabel").textContent = "";
    setActiveView("waitingView");
    return;
  }
  if (game.complete) {
    setActiveView("teamFinalView");
    return;
  }
  if (game.results[game.currentRound]) {
    renderResultView();
    return;
  }
  renderRoundView();
}

async function submitAnswer() {
  const input = $("teamAnswerInput");
  const answer = input ? input.value.trim() : "";
  if (!answer) {
    $("teamSubmitStatus").textContent = "Choose an answer before submitting.";
    return;
  }
  try {
    const { state } = await apiPost({ action: "submitAnswer", code: teamCode, answer });
    game = state;
    $("teamSubmitStatus").textContent = "Answer submitted. You can change it until the round is locked.";
    renderCurrentView();
  } catch (err) {
    $("teamSubmitStatus").textContent = err.message;
  }
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  teamCode = null;
  teamIndex = -1;
  if (pollInterval) clearInterval(pollInterval);
  if (timerInterval) clearInterval(timerInterval);
  $("teamCodeInput").value = "";
  $("loginError").hidden = true;
  setActiveView("loginView");
}

async function joinWithCode(code) {
  try {
    const fresh = await apiGet();
    const index = fresh.teamCodes.indexOf(code);
    if (!fresh.started || index === -1) {
      $("loginError").textContent = "Code not recognised. Check with your facilitator.";
      $("loginError").hidden = false;
      return false;
    }
    game = fresh;
    teamIndex = index;
    teamCode = code;
    sessionStorage.setItem(SESSION_KEY, code);
    $("loginError").hidden = true;
    renderCurrentView();
    ensureTimerTick();
    startPolling();
    return true;
  } catch (err) {
    $("loginError").textContent = err.message;
    $("loginError").hidden = false;
    return false;
  }
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    try {
      const fresh = await apiGet();
      const index = fresh.teamCodes.indexOf(teamCode);
      if (index === -1) {
        logout();
        return;
      }
      const roundChanged = fresh.currentRound !== game.currentRound || Boolean(fresh.results[fresh.currentRound]) !== Boolean(game.results[game.currentRound]);
      teamIndex = index;
      game = fresh;
      if (roundChanged) ensureTimerTick();
      renderCurrentView();
    } catch (err) {
      /* transient network hiccup — try again on the next tick */
    }
  }, POLL_MS);
}

function init() {
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = $("teamCodeInput").value.trim();
    if (!/^\d{4}$/.test(code)) {
      $("loginError").textContent = "Enter the 4-digit code your facilitator gave you.";
      $("loginError").hidden = false;
      return;
    }
    await joinWithCode(code);
  });
  $("teamSubmitButton").addEventListener("click", submitAnswer);
  ["teamLogoutButton", "teamLogoutButton2", "teamLogoutButton3", "teamLogoutButton4"].forEach((id) => {
    $(id).addEventListener("click", logout);
  });

  const savedCode = sessionStorage.getItem(SESSION_KEY);
  if (savedCode) joinWithCode(savedCode);
}

init();
