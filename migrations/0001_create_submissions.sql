CREATE TABLE IF NOT EXISTS questionnaire_submissions (
  uid TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  class_name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  answers_json TEXT NOT NULL CHECK (json_valid(answers_json)),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_submitted_at
  ON questionnaire_submissions (submitted_at DESC);
