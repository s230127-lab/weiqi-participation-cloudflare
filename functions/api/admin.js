import { json } from "../_lib/auth.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export async function onRequestGet({ request, env }) {
  const suppliedKey = request.headers.get("X-Admin-Key") || "";
  if (!env.ADMIN_KEY || !safeEqual(suppliedKey, env.ADMIN_KEY)) {
    return json({ error: "管理員密鑰不正確。" }, 401);
  }

  try {
    const result = await env.DB.prepare(`
      SELECT uid, email, class_name, student_number, answers_json, submitted_at
      FROM questionnaire_submissions
      ORDER BY submitted_at DESC
      LIMIT 1000
    `).all();

    const records = (result.results || []).map((row) => ({
      uid: row.uid,
      email: row.email,
      className: row.class_name,
      studentNumber: row.student_number,
      answers: JSON.parse(row.answers_json || "{}"),
      submittedAt: row.submitted_at
    }));
    return json({ records });
  } catch (error) {
    console.error("Admin records query failed:", error);
    return json({ error: "無法載入紀錄，請稍後再試。" }, 503);
  }
}
