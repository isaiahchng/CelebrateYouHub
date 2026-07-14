let profile = null;
let myCurrentWeek = 1;

document.getElementById("signout-link").addEventListener("click", (e) => {
  e.preventDefault();
  signOut();
});

async function init() {
  const session = await requireSession();
  if (!session) return;

  profile = await getMyProfile();
  const cohort = await getMyCohort(profile);
  myCurrentWeek = getCurrentWeekNumber(cohort ? cohort.start_date : null);

  const card = document.getElementById("team-card");

  if (!profile.team_id) {
    card.innerHTML = `<p class="small">You haven't been assigned to a peer circle yet. Reach out to your facilitator and they'll add you to one.</p>`;
    return;
  }

  const { data: team } = await supabaseClient
    .from("teams")
    .select("*")
    .eq("id", profile.team_id)
    .single();
  if (team) document.getElementById("team-title").textContent = `My Peer Circle — ${team.name}`;

  card.innerHTML = `
    <form id="post-form">
      <label for="post-content">Share something with your circle</label>
      <textarea id="post-content" required placeholder="How did this week's challenge go? What are you working on?"></textarea>
      <button type="submit">Post to My Circle</button>
      <div id="post-message"></div>
    </form>
    <hr style="margin: 24px 0; border: none; border-top: 1px solid var(--border);" />
    <div id="posts-list" class="posts-scroll"><p class="small">Loading…</p></div>
  `;

  document.getElementById("post-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type=submit]");
    const msgEl = document.getElementById("post-message");
    const content = document.getElementById("post-content").value.trim();
    if (!content) return;

    btn.disabled = true;
    btn.textContent = "Posting…";

    const { error } = await supabaseClient.from("peer_posts").insert({
      team_id: profile.team_id,
      participant_id: profile.id,
      author_name: profile.full_name || profile.email,
      week_number: myCurrentWeek,
      content,
    });

    btn.disabled = false;
    btn.textContent = "Post to My Circle";

    if (error) {
      msgEl.innerHTML = `<div class="msg error">${error.message}</div>`;
      return;
    }

    document.getElementById("post-content").value = "";
    msgEl.innerHTML = "";
    await renderPosts();
  });

  await renderPosts();
}

async function renderPosts() {
  const listEl = document.getElementById("posts-list");
  const { data: posts, error } = await supabaseClient
    .from("peer_posts")
    .select("*")
    .eq("team_id", profile.team_id)
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<div class="msg error">Couldn't load posts: ${error.message}</div>`;
    return;
  }

  if (!posts || posts.length === 0) {
    listEl.innerHTML = `<p class="small">No posts yet — be the first to share with your circle.</p>`;
    return;
  }

  listEl.innerHTML = posts
    .map(
      (p) => `
    <div class="post${p.is_facilitator_post ? " facilitator" : ""}">
      <div class="meta"><strong>${escapeHtml(p.author_name)}</strong>${p.week_number ? `<span class="week-tag">Week ${p.week_number}</span>` : ""}<span class="time-ago">${formatRelativeTime(p.created_at)}</span></div>
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
