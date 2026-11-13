import { requireFirebaseUser, getCompletedGames, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireFirebaseUser(request, env);
  if (auth.error) return auth.error;

  try {
    const games = await getCompletedGames(auth.user.uid, env);
    const submission = await env.DB.prepare(
      "SELECT submitted_at FROM questionnaire_submissions WHERE uid = ?1"
    ).bind(auth.user.uid).first();

    return json({
      games,
      gameCompleted: games >= 1,
      formSubmitted: Boolean(submission),
      submittedAt: submission ? submission.submitted_at : null,
      completed: games >= 1 && Boolean(submission)
    });
  } catch (error) {
    console.error("Participation status failed:", error);
    return json({ error: error.message || "暫時無法核對，請稍後再試。" }, 503);
  }
}
