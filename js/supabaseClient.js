// Requires config.js to be loaded first, and the Supabase CDN script:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);

// Redirects to index.html if nobody is signed in. Returns the session.
async function requireSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// Fetches (and lazily waits for) the caller's own profile row.
async function getMyProfile() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }
  return data;
}

async function signOut() {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

// Fetches the caller's cohort (class batch) row, or null if they haven't
// been assigned to one yet.
async function getMyCohort(profile) {
  if (!profile || !profile.cohort_id) return null;
  const { data, error } = await supabaseClient
    .from("cohorts")
    .select("*")
    .eq("id", profile.cohort_id)
    .single();
  if (error) {
    console.error("Failed to load cohort", error);
    return null;
  }
  return data;
}

// Working out which week (1-8) a cohort is currently on, based on its
// start_date (a "YYYY-MM-DD" string). Participants can still open earlier
// weeks they missed, but can't jump ahead of the live week.
function getCurrentWeekNumber(startDateStr) {
  if (!startDateStr) return 1;
  const start = new Date(startDateStr + "T00:00:00");
  const today = new Date();
  const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  const week = Math.floor(diffDays / 7) + 1;
  return Math.min(8, Math.max(1, week));
}

// Short relative timestamp for peer circle posts, e.g. "2h ago", "3d ago".
function formatRelativeTime(dateStr) {
  const diffMs = new Date() - new Date(dateStr);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWeek = Math.floor(diffDay / 7);
  if (diffWeek < 5) return `${diffWeek}w ago`;
  return new Date(dateStr).toLocaleDateString();
}
