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
  await loadPeerCircles();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("tab-queue").style.display = tab === "queue" ? "block" : "none";
  document.getElementById("tab-engagement").style.display = tab === "engagement" ? "block" : "none";
  document.getElementById("tab-teams").style.display = tab === "teams" ? "block" : "none";
  document.getElementById("tab-circles").style.display = tab === "circles" ? "block" : "none";
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

  const [{ data: participants }, { data: submissions }, { data: feedback }, { data: cohorts }] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("is_admin", false).order("full_name"),
    supabaseClient.from("submissions").select("*"),
    supabaseClient.from("feedback_queue").select("*"),
    supabaseClient.from("cohorts").select("*"),
  ]);

  const cohortById = {};
  (cohorts || []).forEach((c) => (cohortById[c.id] = c));

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
      const cohort = p.cohort_id ? cohortById[p.cohort_id] : null;
      const currentWeek = cohort ? getCurrentWeekNumber(cohort.start_date) : 0;

      let cells = "";
      for (let w = 1; w <= 8; w++) {
        const sub = subMap[subKey(p.id, w)];
        let cell = "";
        if (!cohort || w > currentWeek) {
          cell = `<span class="small">—</span>`;
        } else if (!sub) {
          cell = `<span class="badge missing">missing</span>`;
        } else {
          const fb = fbMap[sub.id];
          cell = fb && fb.status === "sent" ? `<span class="badge sent">sent</span>` : `<span class="badge pending">pending</span>`;
        }
        cells += `<td>${cell}</td>`;
      }
      const cohortLabel = cohort ? escapeHtml(cohort.name) : `<span class="small">no batch</span>`;
      return `<tr><td>${escapeHtml(p.full_name || p.email)}<br/><span class="small">${cohortLabel}</span></td>${cells}</tr>`;
    })
    .join("");

  el.innerHTML = `
    <p class="small">Each participant's week is calculated from their own cohort's start date (set in the Teams tab).</p>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Participant</th>${headerCells}</tr></thead>
        <tbody>${rows || `<tr><td colspan="9" class="small">No participants yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

// ---------------- Cohorts & Teams ----------------

async function loadTeams() {
  const el = document.getElementById("tab-teams");

  const [{ data: teams }, { data: cohorts }, { data: participants }, { data: invites }] = await Promise.all([
    supabaseClient.from("teams").select("*").order("name"),
    supabaseClient.from("cohorts").select("*").order("start_date", { ascending: false }),
    supabaseClient.from("profiles").select("*").eq("is_admin", false).order("full_name"),
    supabaseClient.from("invited_participants").select("*").order("created_at", { ascending: false }),
  ]);

  const cohortOptionsHtml = (selectedId) =>
    (cohorts || [])
      .map((c) => `<option value="${c.id}" ${selectedId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
      .join("");

  // Teams with no cohort_id are legacy/unscoped and stay selectable from any
  // batch; teams tied to a cohort only show up for participants in that
  // same cohort (the database enforces this too — see validate_profile_team_cohort).
  const teamsForCohort = (cohortId) => (teams || []).filter((t) => !t.cohort_id || t.cohort_id === cohortId);
  const teamOptionsHtml = (selectedId, cohortId) =>
    teamsForCohort(cohortId)
      .map((t) => `<option value="${t.id}" ${selectedId === t.id ? "selected" : ""}>${escapeHtml(t.name)}</option>`)
      .join("");

  const cohortById = {};
  (cohorts || []).forEach((c) => (cohortById[c.id] = c));
  const teamById = {};
  (teams || []).forEach((t) => (teamById[t.id] = t));

  const inviteList = (invites || [])
    .map(
      (i) => `
    <div class="post">
      <div class="meta">
        <strong>${escapeHtml(i.email)}</strong>${i.full_name ? " — " + escapeHtml(i.full_name) : ""}
        — batch: ${i.cohort_id && cohortById[i.cohort_id] ? escapeHtml(cohortById[i.cohort_id].name) : "none"}
        — team: ${i.team_id && teamById[i.team_id] ? escapeHtml(teamById[i.team_id].name) : "none"}
      </div>
      <button class="secondary" data-cancel-invite="${escapeHtml(i.email)}" style="margin-top:6px;">Cancel invite</button>
    </div>
  `
    )
    .join("");

  const cohortList = (cohorts || [])
    .map((c) => {
      const count = (participants || []).filter((p) => p.cohort_id === c.id).length;
      return `
        <div class="post">
          <div class="meta">
            <strong>${escapeHtml(c.name)}</strong> — starts ${c.start_date} — ${count} participant${count === 1 ? "" : "s"}
          </div>
          <label style="margin-top:6px;">Start date</label>
          <input type="date" value="${c.start_date}" data-cohort-date="${c.id}" style="max-width:200px;" />
          <button class="secondary" data-delete-cohort="${c.id}" style="margin-top:6px;">Delete batch</button>
        </div>
      `;
    })
    .join("");

  const teamList = (teams || [])
    .map((t) => {
      const count = (participants || []).filter((p) => p.team_id === t.id).length;
      return `
        <div class="post">
          <div class="meta"><strong>${escapeHtml(t.name)}</strong> — ${count} participant${count === 1 ? "" : "s"}</div>
          <label style="margin-top:6px;">Batch</label>
          <select data-team-cohort="${t.id}" style="max-width:220px;">
            <option value="">— Unscoped (any batch) —</option>
            ${cohortOptionsHtml(t.cohort_id)}
          </select>
          <button class="secondary" data-delete-team="${t.id}" style="margin-top:6px;">Delete team</button>
        </div>
      `;
    })
    .join("");

  const participantRows = (participants || [])
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.full_name || "(no name set)")}<br/><span class="small">${escapeHtml(p.email)}</span></td>
      <td>
        <select data-participant-cohort="${p.id}">
          <option value="">— Unassigned —</option>
          ${cohortOptionsHtml(p.cohort_id)}
        </select>
      </td>
      <td>
        <select data-participant-team="${p.id}">
          <option value="">— Unassigned —</option>
          ${teamOptionsHtml(p.team_id, p.cohort_id)}
        </select>
      </td>
    </tr>
  `
    )
    .join("");

  el.innerHTML = `
    <h3>Invite a participant</h3>
    <p class="small">Assign someone's batch/team before they ever sign in — their account is created already set up the first time they use their magic link, instead of landing on an empty screen.</p>
    <form id="invite-form" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <div style="flex:1; min-width:200px;">
        <label for="invite-email">Email</label>
        <input type="email" id="invite-email" required placeholder="participant@example.com" />
      </div>
      <div style="flex:1; min-width:160px;">
        <label for="invite-name">Full name (optional)</label>
        <input type="text" id="invite-name" placeholder="Jane Tan" />
      </div>
      <div style="min-width:160px;">
        <label for="invite-cohort">Batch</label>
        <select id="invite-cohort">
          <option value="">— None yet —</option>
          ${cohortOptionsHtml(null)}
        </select>
      </div>
      <div style="min-width:160px;">
        <label for="invite-team">Team (optional)</label>
        <select id="invite-team">
          <option value="">— None yet —</option>
          ${teamOptionsHtml(null, null)}
        </select>
      </div>
      <button type="submit" style="margin-top:18px;">Invite</button>
    </form>
    <div id="invite-form-message"></div>

    ${invites && invites.length ? `<h3 style="margin-top:20px;">Pending invites (not yet signed in)</h3>${inviteList}` : ""}

    <h3 style="margin-top:28px;">Create a batch (cohort)</h3>
    <p class="small">Each batch has its own start date — participants in that batch see week 1 from that date, week 2 the following week, and so on.</p>
    <form id="new-cohort-form" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <div style="flex:1; min-width:180px;">
        <label for="new-cohort-name">Batch name</label>
        <input type="text" id="new-cohort-name" required placeholder="e.g. July 2026 Batch" />
      </div>
      <div style="min-width:180px;">
        <label for="new-cohort-date">Start date (Monday)</label>
        <input type="date" id="new-cohort-date" required />
      </div>
      <button type="submit" style="margin-top:18px;">Create Batch</button>
    </form>
    <div id="cohort-form-message"></div>

    <h3 style="margin-top:28px;">Existing batches</h3>
    ${cohortList || `<p class="small">No batches yet — create one above.</p>`}

    <h3 style="margin-top:28px;">Create a peer circle</h3>
    <p class="small">A team belongs to one batch — only participants in that batch can be assigned to it.</p>
    <form id="new-team-form" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <div style="flex:1; min-width:200px;">
        <label for="new-team-name">Team name</label>
        <input type="text" id="new-team-name" required placeholder="e.g. Circle A" />
      </div>
      <div style="min-width:180px;">
        <label for="new-team-cohort">Batch</label>
        <select id="new-team-cohort" required>
          <option value="" disabled selected>Choose a batch…</option>
          ${cohortOptionsHtml(null)}
        </select>
      </div>
      <button type="submit" style="margin-top:18px;">Create Team</button>
    </form>
    <div id="team-form-message"></div>

    <h3 style="margin-top:28px;">Existing peer circles</h3>
    ${teamList || `<p class="small">No teams yet — create one above.</p>`}

    <h3 style="margin-top:28px;">Assign participants</h3>
    <p class="small">Changing a participant's batch or team saves immediately.</p>
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Participant</th><th>Batch</th><th>Team</th></tr></thead>
        <tbody>${participantRows || `<tr><td colspan="3" class="small">No participants yet — they'll appear here once they sign in once.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById("invite-cohort").addEventListener("change", (e) => {
    document.getElementById("invite-team").innerHTML =
      `<option value="">— None yet —</option>` + teamOptionsHtml(null, e.target.value || null);
  });

  document.getElementById("invite-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("invite-form-message");
    const email = document.getElementById("invite-email").value.trim().toLowerCase();
    const fullName = document.getElementById("invite-name").value.trim() || null;
    const cohortId = document.getElementById("invite-cohort").value || null;
    const teamId = document.getElementById("invite-team").value || null;
    if (!email) return;

    // If this person has already signed in once, update their existing
    // profile directly — the invite table is only consumed on first signup.
    const { data: existingProfile } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let error;
    if (existingProfile) {
      ({ error } = await supabaseClient
        .from("profiles")
        .update({
          full_name: fullName || undefined,
          cohort_id: cohortId,
          team_id: teamId,
        })
        .eq("id", existingProfile.id));
    } else {
      ({ error } = await supabaseClient
        .from("invited_participants")
        .upsert({ email, full_name: fullName, cohort_id: cohortId, team_id: teamId }));
    }

    if (error) {
      msgEl.innerHTML = `<div class="msg error">${error.message}</div>`;
      return;
    }
    msgEl.innerHTML = `<div class="msg success">${existingProfile ? "Existing participant updated." : "Invite saved — they'll be set up automatically on first sign-in."}</div>`;
    await loadTeams();
    await loadEngagement();
  });

  el.querySelectorAll("[data-cancel-invite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { error } = await supabaseClient
        .from("invited_participants")
        .delete()
        .eq("email", btn.dataset.cancelInvite);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
    });
  });

  document.getElementById("new-cohort-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("cohort-form-message");
    const name = document.getElementById("new-cohort-name").value.trim();
    const startDate = document.getElementById("new-cohort-date").value;
    if (!name || !startDate) return;

    const { error } = await supabaseClient.from("cohorts").insert({ name, start_date: startDate });
    if (error) {
      msgEl.innerHTML = `<div class="msg error">${error.message}</div>`;
      return;
    }
    await loadTeams();
  });

  document.getElementById("new-team-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("new-team-name");
    const msgEl = document.getElementById("team-form-message");
    const name = nameInput.value.trim();
    const cohortId = document.getElementById("new-team-cohort").value;
    if (!name || !cohortId) return;

    const { error } = await supabaseClient.from("teams").insert({ name, cohort_id: cohortId });
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

  el.querySelectorAll("[data-team-cohort]").forEach((select) => {
    select.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("teams")
        .update({ cohort_id: select.value || null })
        .eq("id", select.dataset.teamCohort);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
    });
  });

  el.querySelectorAll("[data-delete-cohort]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this batch? Members will become unassigned, not deleted.")) return;
      const { error } = await supabaseClient.from("cohorts").delete().eq("id", btn.dataset.deleteCohort);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
    });
  });

  el.querySelectorAll("[data-cohort-date]").forEach((input) => {
    input.addEventListener("change", async () => {
      const { error } = await supabaseClient
        .from("cohorts")
        .update({ start_date: input.value })
        .eq("id", input.dataset.cohortDate);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
      await loadEngagement();
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

  el.querySelectorAll("[data-participant-cohort]").forEach((select) => {
    select.addEventListener("change", async () => {
      const participantId = select.dataset.participantCohort;
      const cohortId = select.value || null;
      // Changing batch also clears any team assignment, since a team belongs
      // to one batch — the admin re-picks a team from the new batch's list.
      const { error } = await supabaseClient
        .from("profiles")
        .update({ cohort_id: cohortId, team_id: null })
        .eq("id", participantId);
      if (error) {
        alert(error.message);
        return;
      }
      await loadTeams();
      await loadEngagement();
    });
  });
}

// ---------------- Peer Circles ----------------

let selectedCircleTeamId = null;

async function loadPeerCircles() {
  const el = document.getElementById("tab-circles");

  const { data: teams } = await supabaseClient.from("teams").select("*, cohorts(name)").order("name");

  if (!teams || teams.length === 0) {
    el.innerHTML = `<p class="small">No peer circles yet — create one in the Batches &amp; Teams tab first.</p>`;
    return;
  }

  if (!selectedCircleTeamId) selectedCircleTeamId = teams[0].id;

  el.innerHTML = `
    <label for="circle-select">Peer circle</label>
    <select id="circle-select">
      ${teams
        .map(
          (t) =>
            `<option value="${t.id}" ${t.id === selectedCircleTeamId ? "selected" : ""}>${escapeHtml(t.name)}${t.cohorts ? " — " + escapeHtml(t.cohorts.name) : ""}</option>`
        )
        .join("")}
    </select>

    <div id="circle-posts" style="margin-top:20px;"><p class="small">Loading…</p></div>

    <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--border);" />
    <form id="circle-post-form">
      <label for="circle-post-content">Reply to this circle as a facilitator</label>
      <textarea id="circle-post-content" required placeholder="Answer a question, encourage the group, share a tip…"></textarea>
      <button type="submit">Post as Facilitator</button>
      <div id="circle-post-message"></div>
    </form>
  `;

  document.getElementById("circle-select").addEventListener("change", (e) => {
    selectedCircleTeamId = e.target.value;
    renderCirclePosts();
  });

  document.getElementById("circle-post-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const msgEl = document.getElementById("circle-post-message");
    const content = document.getElementById("circle-post-content").value.trim();
    if (!content) return;

    btn.disabled = true;
    btn.textContent = "Posting…";

    const { error } = await supabaseClient.from("peer_posts").insert({
      team_id: selectedCircleTeamId,
      participant_id: profile.id,
      author_name: profile.full_name || profile.email,
      is_facilitator_post: true,
      content,
    });

    btn.disabled = false;
    btn.textContent = "Post as Facilitator";

    if (error) {
      msgEl.innerHTML = `<div class="msg error">${error.message}</div>`;
      return;
    }
    document.getElementById("circle-post-content").value = "";
    msgEl.innerHTML = "";
    await renderCirclePosts();
  });

  await renderCirclePosts();
}

async function renderCirclePosts() {
  const listEl = document.getElementById("circle-posts");
  const { data: posts, error } = await supabaseClient
    .from("peer_posts")
    .select("*")
    .eq("team_id", selectedCircleTeamId)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="msg error">Couldn't load posts: ${error.message}</div>`;
    return;
  }

  if (!posts || posts.length === 0) {
    listEl.innerHTML = `<p class="small">No posts in this circle yet.</p>`;
    return;
  }

  listEl.innerHTML = posts
    .map(
      (p) => `
    <div class="post${p.is_facilitator_post ? " facilitator" : ""}">
      <div class="meta"><strong>${escapeHtml(p.author_name)}</strong> · Week ${p.week_number ?? "-"} · ${new Date(p.created_at).toLocaleDateString()}</div>
      <div class="content">${escapeHtml(p.content)}</div>
    </div>
  `
    )
    .join("");
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
