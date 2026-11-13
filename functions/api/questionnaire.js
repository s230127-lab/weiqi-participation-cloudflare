import { requireFirebaseUser, json, readJson, cleanText } from "../_lib/auth.js";

const QUESTIONS = {
  q1: { options: ["堯帝", "孫子", "李世石", "「爛柯」傳說中的樵夫"], correct: "堯帝" },
  q2: { options: ["圍棋傳入朝鮮半島和日本", "日本設立獲幕府支持的圍棋家元", "AlphaGo 以四比一擊敗世界冠軍李世石", "最早可靠的圍棋記載見於《左傳》"], correct: "AlphaGo 以四比一擊敗世界冠軍李世石" },
  q3: { options: ["黑先白後，雙方輪流把棋子下在 19×19 棋盤的交叉點上", "白先黑後，雙方輪流把棋子下在棋盤的方格內", "雙方輪流沿著棋盤的線移動棋子", "黑方先連下兩子，然後才輪到白方下棋"], correct: "黑先白後，雙方輪流把棋子下在 19×19 棋盤的交叉點上" },
  q4: { options: ["劫", "貼目", "氣", "禁入點"], correct: "氣" },
  q5: { options: ["補償黑方先行的優勢", "獎勵白方提走最多棋子", "解決「劫」的重複局面規則", "調整使用九路棋盤而非十九路棋盤的差異"], correct: "補償黑方先行的優勢" }
};

export async function onRequestPost({ request, env }) {
  const auth = await requireFirebaseUser(request, env);
  if (auth.error) return auth.error;

  let data;
  try {
    data = await readJson(request);
    const className = cleanText(data.className, "班級", 40);
    const studentNumber = cleanText(data.studentNumber, "班號", 30);
    if (!data.answers || typeof data.answers !== "object" || Array.isArray(data.answers)) {
      throw new Error("請回答全部五條問題。");
    }

    const answers = {};
    let score = 0;
    const wrongQuestions = [];
    for (const [questionId, question] of Object.entries(QUESTIONS)) {
      const answer = cleanText(data.answers[questionId], `第 ${questionId.slice(1)} 題`, 160);
      if (!question.options.includes(answer)) {
        throw new Error(`第 ${questionId.slice(1)} 題答案無效，請從指定選項中選擇。`);
      }
      answers[questionId] = answer;
      if (answer === question.correct) score += 2;
      else wrongQuestions.push(Number(questionId.slice(1)));
    }

    // 5 分或以下不會寫入完成紀錄；學生可重新作答。
    if (score <= 5) {
      return json({
        submitted: false,
        passed: false,
        score,
        maxScore: 10,
        wrongQuestions,
        message: "未達 6 分，請重新作答。"
      }, 422);
    }

    const result = await env.DB.prepare(`
      INSERT INTO questionnaire_submissions
        (uid, email, class_name, student_number, answers_json, score)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(uid) DO NOTHING
    `).bind(
      auth.user.uid,
      auth.user.email,
      className,
      studentNumber,
      JSON.stringify(answers),
      score
    ).run();

    if (!result.meta || result.meta.changes !== 1) {
      return json({ error: "此 Google 帳戶已通過並提交問卷。如需更正，請聯絡管理員。" }, 409);
    }

    return json({ submitted: true, passed: true, score, maxScore: 10 }, 201);
  } catch (error) {
    console.error("Questionnaire submission failed:", error);
    return json({ error: error.message || "提交失敗，請稍後再試。" }, 400);
  }
}
