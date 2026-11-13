CREATE TABLE IF NOT EXISTS questionnaire_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  class_name TEXT NOT NULL,
  student_number TEXT NOT NULL,
  answers_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_questionnaire_submissions_submitted_at
  ON questionnaire_submissions(submitted_at);
