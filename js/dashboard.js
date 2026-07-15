let profile = null;
let weeks = [];
let submissionsByWeek = {};
let feedbackByWeek = {};
let currentWeek = 1;
let selectedWeek = 1;

document.getElementById("signout-link").addEventListener("click", (e) => {
  e.preventDefault();
  signOut();
});

async function init() {
  const session = await requireSession();
  if (!session) return;

  profile = await getMyProfile();
  if (profile.is_admin) {
    window.location.href = "admin.html";
    return;
  }

  document.getElementById("greeting").textContent = profile.full_name
    ? `Welcome back, ${profile.full_name.split(" ")[0]}`
    : "Welcome back";

  const cohort = await getMyCohort(profile);
  if (!cohort) {
    document.getElementById("week-card").innerHTML = `<p class="small">You haven't been assigned to a programme batch yet. Reach out to your facilitator and they'll get you set up — your weekly nudges will appear here once you are.</p>`;
    document.getElementById("week-pills").style.display = "none";
    return;
  }

  currentWeek = getCurrentWeekNumber(cohort.start_date);
  selectedWeek = currentWeek;

  const { data: weeklyContent } = await supabaseClient
    .from("weekly_content")
    .select("*")
    .order("week_number", { ascending: true });
  weeks = weeklyContent || [];

  const { data: submissions } = await supabaseClient
    .from("submissions")
    .select("*")
    .eq("participant_id", profile.id);
  (submissions || []).forEach((s) => (submissionsByWeek[s.week_number] = s));

  const { data: feedback } = await supabaseClient
    .from("feedback_queue")
    .select("*")
    .eq("participant_id", profile.id)
    .eq("status", "sent");
  (feedback || []).forEach((f) => {
    const sub = (submissions || []).find((s) => s.id === f.submission_id);
    if (sub) feedbackByWeek[sub.week_number] = f;
  });

  renderPills();
  renderWeek(selectedWeek);
}

function renderPills() {
  const el = document.getElementById("week-pills");
  el.innerHTML = "";
  for (let w = 1; w <= 8; w++) {
    const pill = document.createElement("div");
    const locked = w > currentWeek;
    const done = !!submissionsByWeek[w];
    let cls = "week-pill";
    if (locked) cls += " locked";
    if (done) cls += " done";
    if (w === selectedWeek) cls += " selected";
    pill.className = cls;
    pill.textContent = `Wk ${w}`;
    if (!locked) {
      pill.addEventListener("click", () => {
        selectedWeek = w;
        renderPills();
        renderWeek(w);
      });
    }
    el.appendChild(pill);
  }
}

function renderWeek(weekNumber) {
  const week = weeks.find((w) => w.week_number === weekNumber);
  const card = document.getElementById("week-card");
  if (!week) {
    card.innerHTML = `<p class="small">This week's content isn't published yet — check back soon.</p>`;
    return;
  }

  const existing = submissionsByWeek[weekNumber];
  const feedback = feedbackByWeek[weekNumber];
  const prompts = week.reflection_prompts || [];
  const answers = existing ? existing.reflection_answers : [];

  let statusBadge = "";
  if (feedback) {
    statusBadge = `<span class="badge sent">Feedback ready</span>`;
  } else if (existing) {
    statusBadge = `<span class="badge pending">Awaiting review</span>`;
  }

  card.innerHTML = `
    <span class="section-label">Week ${week.week_number} · ${escapeHtml(week.domain)}</span>
    ${statusBadge}
    <h2>${escapeHtml(week.title)}</h2>

    <span class="section-label">📖 Insight</span>
    <p class="insight-text">${escapeHtml(week.insight)}</p>

    <form id="reflection-form">
      <span class="section-label">💭 Reflection</span>
      ${prompts
        .map(
          (q, i) => `
        <label for="answer-${i}">${escapeHtml(q)}</label>
        <textarea id="answer-${i}" ${existing ? "" : "required"}>${escapeHtml(answers[i] || "")}</textarea>
      `
        )
        .join("")}

      <span class="section-label amber">🎯 This Week's Challenge</span>
      <p class="challenge-text">${escapeHtml(week.challenge)}</p>

      <label for="challenge-status">How did it go?</label>
      <select id="challenge-status">
        <option value="completed" ${existing && existing.challenge_status === "completed" ? "selected" : ""}>I completed the challenge</option>
        <option value="partial" ${existing && existing.challenge_status === "partial" ? "selected" : ""}>I made a start / partially completed it</option>
        <option value="not_started" ${!existing || existing.challenge_status === "not_started" ? "selected" : ""}>I haven't started yet</option>
      </select>

      ${
        week.week_number === 8
          ? `
      <label for="challenge-notes">Write your three things here — what you're proud of, your Keystone Habit, and who you'll share it with</label>
      <textarea id="challenge-notes" ${existing ? "" : "required"}>${escapeHtml((existing && existing.challenge_notes) || "")}</textarea>
      `
          : ""
      }

      <span class="section-label">👥 Peer Circle</span>
      <p class="challenge-text">${escapeHtml(week.peer_circle_prompt)}</p>

      <div class="facilitator-question">
        <span class="section-label">❓ Ask Your Facilitator</span>
        <p class="challenge-text">Optional — got a question about applying this to your own situation? Ask here.</p>
        <textarea id="question-for-facilitator" placeholder="e.g. How does this apply if I have a knee injury?">${escapeHtml((existing && existing.question_for_facilitator) || "")}</textarea>
      </div>

      <button type="submit">${existing ? "Update My Reflection" : "Submit My Reflection"}</button>
      <div id="submit-message"></div>
    </form>

    ${
      feedback
        ? `<div class="feedback-block">
            <h3>Feedback from your facilitator</h3>
            <div>${escapeHtml(feedback.final_feedback || "")}</div>
            ${feedback.suggested_next_steps ? `<h3>Suggested next steps</h3><div>${escapeHtml(feedback.suggested_next_steps)}</div>` : ""}
          </div>`
        : existing
        ? `<p class="pending-note">Your reflection has been submitted and is being reviewed. Feedback usually arrives within a couple of days — it'll show up here.</p>`
        : ""
    }
  `;

  document.getElementById("reflection-form").addEventListener("submit", (e) => submitReflection(e, week));
}

async function submitReflection(e, week) {
  e.preventDefault();
  const btn = e.target.querySelector("button[type=submit]");
  const msgEl = document.getElementById("submit-message");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const prompts = week.reflection_prompts || [];
  const answers = prompts.map((_, i) => document.getElementById(`answer-${i}`).value.trim());

  const payload = {
    participant_id: profile.id,
    week_number: week.week_number,
    reflection_answers: answers,
    challenge_status: document.getElementById("challenge-status").value,
    challenge_notes: document.getElementById("challenge-notes")?.value.trim() || null,
    question_for_facilitator: document.getElementById("question-for-facilitator").value.trim(),
  };

  const { data, error } = await supabaseClient
    .from("submissions")
    .upsert(payload, { onConflict: "participant_id,week_number" })
    .select()
    .single();

  btn.disabled = false;

  if (error) {
    msgEl.innerHTML = `<div class="msg error">Something went wrong: ${error.message}</div>`;
    btn.textContent = "Submit My Reflection";
    return;
  }

  submissionsByWeek[week.week_number] = data;
  msgEl.innerHTML = `<div class="msg success">Saved! Your facilitator will review this and send feedback soon.</div>`;
  renderPills();
  renderWeek(selectedWeek);
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
