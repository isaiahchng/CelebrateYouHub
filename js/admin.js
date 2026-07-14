let profile = null;

document.getElementById("signout-link").addEventListener("click", (e) => {
  e.preventDefault();
  signOut();
});

async function init() {
  const session = await requireSession();
  if (!session) return;

  profile = await getMyProfile();
  if (!profile || !profile.is_admin) {
    document.getElementById("not-admin-msg").style.display = "block";
    return;
  }

  document.getElementById("admin-area").style.display = "block";

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  await loadQueue();
  await loadEngagement();
  await loadTeams();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("tab-queue").style.display = tab === "queue" ? "block" : "none";
  document.getElementById("tab-engagement").style.display = tab === "engagement" ? "block" : "none";
  document.getElementById("tab-teams").style.display = tab === "teams" ? "block" : "none";
}

// ---------------- Review Queue ----------------

async function loadQueue() {
  const el = document.getElementById("tab-queue");
  const { data: items, error } = await supabaseClient
    .from("feedback_queue")
    .select("*, submissions(*), profiles!participant_id(full_name, email)")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    el.innerHTML = `<div class="msg error">Couldn't load queue: ${error.message}</div>`;
    return;
  }

  if (!items || items.length === 0) {
    el.innerHTML = `<p class="small">Nothing waiting for review right now. 🎉</p>`;
    return;
  }

  const { data: weeklyContent } = await supabaseClient.from("weekly_content").select("*");
  const weekMap = {};
  (weeklyContent || []).forEach((w) => (weekMap[w.week_number] = w));

  el.innerHTML = items
    .map((item, idx) => {
      const sub = item.submissions;
      const week = weekMap[sub.week_number] || {};
      const prompts = week.reflection_prompts || [];
      const answers = sub.reflection_answers || [];
      const participantName = item.profiles?.full_name || item.profiles?.email || "Unknown";

      let flags = "";
      if (sub.week_number === 3 && sub.challenge_status === "not_started") {
        flags += `<div class="flag">⚑ Hasn't started exercising by Week 3 — consider a 1:1 coaching check-in.</div>`;
      }
      if (sub.question_for_facilitator) {
        flags += `<div class="flag">⚑ Has a direct question for you (see below).</div>`;
      }

      return `
        <div class="review-item" data-id="${item.id}">
          <h3>${escapeHtml(participantName)} — Week ${sub.week_number}: ${escapeHtml(week.title || "")}</h3>
          <p class="small">Submitted ${new Date(sub.submitted_at).toLocaleString()}</p>
          ${flags}

          ${prompts
            .map(
              (q, i) => `
            <div class="qa-block">
              <div class="q">${escapeHtml(q)}</div>
              <div class="a">${escapeHtml(answers[i] || "(no answer)")}</div>
            </div>
          `
            )
            .join("")}

          <div class="qa-block">
            <div class="q">Challenge status</div>
            <div class="a">${escapeHtml(sub.challenge_status)}${sub.challenge_notes ? " — " + escapeHtml(sub.challenge_notes) : ""}</div>
          </div>

          ${
            sub.question_for_facilitator
              ? `<div class="qa-block"><div class="q">Question for facilitator</div><div class="a">${escapeHtml(sub.question_for_facilitator)}</div></div>`
              : ""
          }

          <label>Feedback to send (AI draft — edit as needed)</label>
          <textarea id="feedback-${item.id}" rows="6">${escapeHtml(item.ai_draft || item.final_feedback || "")}</textarea>

          <label>Suggested next steps</label>
          <textarea id="nextsteps-${item.id}" rows="3">${escapeHtml(item.suggested_next_steps || "")}</textarea>

          <button data-approve="${item.id}">Approve &amp; Send</button>
          <span id="queue-message-${item.id}"></span>
        </div>
      `;
    })
    .join("");

  el.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => approveAndSend(btn.dataset.approve));
  });
}

async function approveAndSend(id) {
  const btn = document.querySelector(`[data-approve="${id}"]`);
  const msgEl = document.getElementById(`queue-message-${id}`);
  const finalFeedback = document.getElementById(`feedback-${id}`).value.trim();
  const nextSteps = document.getElementById(`nextsteps-${id}`).value.trim();

  if (!finalFeedback) {
    msgEl.innerHTML = `<span style="color:#a13a2a;">Write some feedback before sending.</span>`;
    return;
  }

  btn.disabled = true;
  btn.textContent = "Sending…";

  const { error } = await supabaseClient
    .from("feedback_queue")
    .update({
      final_feedback: finalFeedback,
      suggested_next_steps: nextSteps,
      status: "sent",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    msgEl.innerHTML = `<span style="color:#a13a2a;">${error.message}</span>`;
    btn.disabled = false;
    btn.textContent = "Approve & Send";
    return;
  }

  document.querySelector(`.review-item[data-id="${id}"]`).remove();
  await loadEngagement();
}

// ---------------- Engagement ----------------

async function loadEngagement() {
  const el = document.getElementById("tab-engagement");

  const [{ data: participants }, { data: submissions }, { data: feedback }] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("is_admin", false).order("full_name"),
    supabaseClient.from("submissions").select("*"),
    supabaseClient.from("feedback_queue").select("*"),
  ]);

  const currentWeek = getCurrentWeekNumber();

  const subKey = (pid, wk) => `${pid}-${wk}`;
  const subMap = {};
  (submissions || []).forEach((s) => (subMap[subKey(s.participant_id, s.week_number)] = s));
  const fbMap = {};
  (feedback || []).forEach((f) => {
    fbMap[f.submission_id] = f;
  });

  let headerCells = "";
  for (let w = 1; w <= 8; w++) headerCells += `<th>Wk ${w}</th>`;

  const rows = (participants || [])
    .map((p) => {
      let cells = "";
      for (let w = 1; w <= 8; w++) {
        const sub = subMap[subKey(p.id, w)];
        let cell = "";
        if (w > currentWeek) {
          cell = `<span class="small">—</span>`;
        } else if (!sub) {
          cell = `<span class="badge missing">missing</span>`;
        } else {
          const fb = fbMap[sub.id];
          cell = fb && fb.status === "sent" ? `<span class="badge sent">sent</span>` : `<span class="badge pending">pending</span>`;
        }
        cells += `<td>${cell}</td>`;
      }
      return `<tr><td>${escapeHtml(p.full_name || p.email)}</td>${cells}</tr>`;
    })
    .join("");

  el.innerHTML = `
    <p class="small">Current programme week: <strong>${currentWeek}</strong> (based on PROGRAM_START_DATE in js/config.js)</p>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Participant</th>${headerCells}</tr></thead>
        <tbody>${rows || `<tr><td colspan="9" class="small">No participants yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ---------------- Teams ----------------

async function loadTeams() {
  const el = document.getElementById("tab-teams");

  const [{ data: teams }, { data: participants }] = await Promise.all([
    supabaseClient.from("teams").select("*").order("name"),
    supabaseClient.from("profiles").select("*").eq("is_admin", false).order("full_name"),
  ]);

  const teamList = (teams || [])
    .map((t) => {
      const count = (participants || []).filter((p) => p.team_id === t.id).length;
      return `
        <div class="post">
          <div class="meta"><strong>${escapeHtml(t.name)}</strong> — ${count} participant${count === 1 ? "" : "s"}</div>
          <button class="secondary" data-delete-team="${t.id}" style="margin-top:6px;">Delete team</button>
        </div>
      `;
    })
    .join("");

  const participantRows = (participants || [])
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.full_name || "(no name set)")}</td>
      <td>${escapeHtml(p.email)}</td>
      <td>
        <select data-participant-team="${p.id}">
          <option value="">— Unassigned —</option>
          ${(teams || [])
            .map(
              (t) => `<option value="${t.id}" ${p.team_id === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`
            )
            .join("")}
        </select>
      </td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <h3>Create a peer circle</h3>
    <form id="new-team-form" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <div style="flex:1; min-width:200px;">
        <label for="new-team-name">Team name</label>
        <input type="text" id="new-team-name" required placeholder="e.g. Circle A" />
      </div>
      <button type="submit" style="margin-top:18px;">Create Team</button>
    </form>
    <div id="team-form-message"></div>

    <h3 style="margin-top:28px;">Existing peer circles</h3>
    ${teamList || `<p class="small">No teams yet — create one above.</p>`}

    <h3 style="margin-top:28px;">Assign participants</h3>
    <p class="small">Changing a participant's team saves immediately.</p>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Team</th></tr></thead>
        <tbody>${participantRows || `<tr><td colspan="3" class="small">No participants yet — they'll appear here once they sign in once.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById("new-team-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-team-name");
    const msgEl = document.getElementById("team-form-message");
    const name = nameInput.value.trim();
    if (!name) return;

    const { error } = await supabaseClient.from("teams").insert({ name });
    if (error) {
      msgEl.innerHTML = `<div class="msg error">${error.message}</div>`;
      return;
    }
    await loadTeams();
  });

  el.querySelectorAll("[data-delete-team]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this team? Members will become unassigned, not deleted.")) return;
      const { error } = await supabaseClient.from("teams").delete().eq("id", btn.dataset.deleteTeam);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
    });
  });

  el.querySelectorAll("[data-participant-team]").forEach((select) => {
    select.addEventListener("change", async () => {
      const participantId = select.dataset.participantTeam;
      const teamId = select.value || null;
      const { error } = await supabaseClient.from("profiles").update({ team_id: teamId }).eq("id", participantId);
      if (error) alert(error.message);
    });
  });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
