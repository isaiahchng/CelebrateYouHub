-- Updates the 8 weeks of nudge content on an already-deployed database to
-- the condensed "3-minute read" version from CY 8Week Brief Nudge
-- Programme App.docx, replacing the longer original wording. Upserts by
-- week_number, so existing weekly_content rows are updated in place —
-- participant submissions and feedback are untouched.

insert into public.weekly_content (week_number, title, domain, insight, reflection_prompts, challenge, peer_circle_prompt) values

(1, 'Your Preferred Future & Ikigai', 'Purpose & Identity',
$$Purpose is a longevity superpower. Research from Rush University (6,985 participants) found that a strong sense of purpose cuts all-cause mortality by 20% — protecting the heart, brain and immune system. Every Blue Zone population shares a clear Ikigai: a personal, specific reason to get up each morning. Your Sunday Afternoon Test score reveals how alive your current sources of meaning are.$$,
'["Revisit your Preferred Future for 60 seconds. What do you still see — and what has shifted?", "Which of your Three Sources of Purpose (Relational, Contribution, Experiential) feels strongest right now? Which feels thin?"]'::jsonb,
$$Write one sentence: "In 5 years, I am..." — place it where you'll see it daily.
Name one example of each Source of Purpose in your workbook (Page 24).$$,
$$Share your "In 5 years, I am..." sentence with your accountability buddy — and ask them to share theirs.$$),

(2, 'Protect Your CHOPE', 'Purpose & Identity',
$$Your CHOPE is your most important priority to protect. Dr Becca Levy at Yale found that a positive mindset about ageing leads to meaningfully better health outcomes and a longer life. When daily choices align with what you value most, stress and regret shrink. When they don't, the cost accumulates quietly. Your CHOPE and your Ikigai are deeply linked — what you protect most often points to your deepest reason to get up each morning.$$,
'["What did you do this past week that honoured your CHOPE — even in a small way?", "Which SIAM (saboteur) did you catch yourself falling into? Looking at your LifeTime, does the path to your Preferred Future feel clearer or more uncertain than it did on Day 1?"]'::jsonb,
$$Block one 30-minute slot this week to deliberately honour your CHOPE.
Write down your top SIAM and one strategy to "attack" it this week.$$,
$$Tell your accountability buddy your CHOPE and the SIAM you're working to overcome. Ask them to check in with you mid-week.$$),

(3, 'Time to Move — How''s Your Plan Going?', 'Physical Health & Movement',
$$VO₂ Max is the single strongest predictor of longevity. A 2018 JAMA study (122,000 participants) found that the least fit people had 5× higher mortality risk than the most fit — greater than the risk from smoking, high blood pressure or diabetes. Your two tools: Zone 2 Training (brisk walking at 60–70% max HR, 150 min/week) and Norwegian 4×4 HIIT (4 min hard + 3 min easy × 4 = 28 min, 1–2×/week). Starting now builds the reserve that protects independence later.$$,
'["Since the course, have you started your personal exercise plan? If yes — what''s working and what''s been hardest?", "If not yet — what specifically got in the way? Look at your fitness plan (Page 51). Which activities did you choose?"]'::jsonb,
$$Complete at least two sessions from your plan this week.
If you haven't started: one 30-min Zone 2 walk + one strength session (2×10 squats + 2×10 push-ups). Log it — a simple tick counts.$$,
$$Check in with your peer circle: who's started their plan? Share what you did — or what got in the way. Invite someone to join a session this week.$$),

(4, 'How Are Your Food Habits?', 'Nutrition & Metabolic Health',
$$Three longevity nutrition habits from the course: (1) The Longevity Plate — ½ veg & fruit, ¼ protein, ¼ whole grains, adaptable to any hawker meal. (2) Protein first — 1.2–1.6g per kg of bodyweight daily, spread across meals with leucine-rich sources (chicken, fish, eggs, tofu, tempeh). (3) Hara Hachi Bu — stop at 80% full; the gut takes 20 min to signal fullness. These habits underpin the PREDIMED Trial (30% lower heart attack & stroke risk) and MIND Diet (53% lower Alzheimer's risk).$$,
'["How different is your eating now compared to before the course?", "Are you building meals around the Longevity Plate? Prioritising protein, especially at breakfast? Eating slower and stopping before you''re full? Which habit has been easiest to start — and which feels hardest?"]'::jsonb,
$$Pick ONE habit and do it consistently for 7 days:
Option A — Longevity Plate: one meal per day follows the ½ / ¼ / ¼ template.
Option B — Protein first: add a protein-rich food to breakfast every day.
Option C — Hara Hachi Bu: stop at 80% full at every dinner, eating slowly, no screens.$$,
$$Share your chosen habit and one meal you're proud of. What Blue Zone-inspired food have you found at your local hawker centre or supermarket?$$),

(5, 'Sleep Well, Stress Less', 'Sleep & Stress',
$$Sleep and stress form a cycle: poor sleep raises cortisol; high cortisol disrupts sleep. Breaking it requires a daily recovery practice. Three techniques from the course: Deep Breathing (4-sec inhale, 6-sec exhale — calms the nervous system in under 3 min). Finger Breathing (trace each finger, inhale up, exhale down — 90 seconds to slow and ground). Container Touch (mentally "place" intrusive thoughts before sleep, freeing your mind to rest). Free resource: AIM to De-Stress (www.aimtodestress.sg).$$,
'["Look back at your Epworth Sleepiness Scale and Sleep Hygiene scores. What did they reveal?", "Which of the five sleep habits are you consistently doing — and which one are you still neglecting? (Regular schedule · Dark, cool bedroom · No screens 30 min before bed · No caffeine after 2pm · Wind-down routine)"]'::jsonb,
$$Each day this week: practise your preferred technique once in the morning and once before sleep.
Commit to one Sleep Hygiene habit for all 7 nights. Set a phone reminder 30 min before your target bedtime: "Wind Down."$$,
$$Ask your peer circle: "What's the one thing that's most improved your sleep or stress since the course?" Try one suggestion from someone else this week.$$),

(6, 'Your Tribe', 'Social Connection',
$$Loneliness is a stronger predictor of early death than smoking 15 cigarettes a day — now classified by the WHO as a public health crisis. The KOPI framework (Keepsakes, Overcome, People, Inspire) was designed to help you have deeper conversations than daily routine allows. Singapore's PHASE study (4,990 participants) confirms that loneliness significantly predicts lower personal mastery and poorer health outcomes locally. Your social network isn't a nicety — it's biological infrastructure.$$,
'["Think about the people you listed under \"P — People\" in your KOPI exercise. When did you last have a genuinely meaningful conversation with one of them?", "Which of your Three Sources of Purpose is Relational — and have you been actively nurturing it?"]'::jsonb,
$$Reach out to one person this week for a KOPI conversation.
You don't need the full framework — just meet for coffee or a walk and ask: "What's something you've been working to overcome recently?" Then listen without offering solutions.$$,
$$Plan a group check-in with your peer circle — even a 30-min virtual call. Peer circles that stay connected show significantly better habit retention at the 3-month re-assessment.$$),

(7, 'Train Your Brain', 'Cognitive Enhancement',
$$The ageing brain has real gains — wisdom, pattern recognition, emotional regulation. The 3P Framework protects them: (a) Positive Lifestyle — sleep, nutrition, exercise, stress, social connection (everything from the past 6 weeks directly supports brain health). (b) Productive Skills — mono-tasking, Pomodoro Technique, Chunk + Record for memory, altering your routine for flexible thinking. (c) Proactive Stimulation — the brain needs genuinely novel challenge to produce neuroplasticity and neurogenesis. Routine activities, even engaging ones, won't do it.$$,
'["Which of the 3 Ps is strongest in your daily life right now — and which is most neglected?", "Recall the course activities: Find the Fs, Ruler Game, Stroop Test, 15-second Recall. Which surprised you most — and what did it reveal about your cognitive strengths or gaps?"]'::jsonb,
$$Choose ONE Productive Skills technique and apply it daily: Pomodoro for demanding tasks · Chunk + Record for daily memory · Change one routine to build flexible thinking.
Choose ONE Proactive Stimulation challenge (20 min × 3 days): Learn 10 words in a new language · Try a new recipe from scratch · Take a different route and notice 3 new things · Play a new strategy game.$$,
$$Share what you tried — especially if it felt awkward. Normalising cognitive challenge in your peer group makes it easier for everyone to keep pushing.$$),

(8, 'Celebrate You!', 'Integration — All Five Domains',
$$You've just completed an 8-week journey through all five domains of healthy longevity. Research on behaviour change (Fogg, 2019) shows that keystone habits — the ones you commit to and identify with — create cascading improvements across all areas of life. You don't need to have done everything perfectly. You need to have moved, and to have noticed that you moved. The programme began with the Wheel of Life and a Preferred Future. It closes in exactly the same place — but you are different. Your scores will tell that story.$$,
'["Return to your Wheel of Life (Page 19). Re-score each domain and compare to Day 1: Purpose & Identity · Physical Health · Nutrition · Sleep & Stress · Social Connection · Cognitive Enhancement.", "Where has there been genuine movement — even just one point? Where do you want to focus next? Re-read your \"In 5 years, I am...\" sentence from Week 1. Does it still feel true? Has it deepened?"]'::jsonb,
$$Write three things before you close your workbook:
1. One thing you're proud of from these 8 weeks — no matter how small.
2. One Keystone Habit you're committing to for the next 3 months.
3. One person you'll share this commitment with today — then share it.$$,
$$Celebrate together. Organise a peer circle reunion — in person if possible. Share your Wheel of Life re-scores. Acknowledge each other's progress. Schedule your next check-in for the 3-month re-assessment.$$)

on conflict (week_number) do update set
  title = excluded.title,
  domain = excluded.domain,
  insight = excluded.insight,
  reflection_prompts = excluded.reflection_prompts,
  challenge = excluded.challenge,
  peer_circle_prompt = excluded.peer_circle_prompt;
