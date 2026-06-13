-- Links a note to an entity elsewhere in Studeo: a course, an assignment, a lecture
-- (class_meeting), a study session, or a term. A note can link to many entities and an
-- entity can have many notes (many-to-many), which is what powers course knowledge bases
-- and exam-review pages that pull from several lectures/assignments.
--
-- entity_id is intentionally NOT a SQL foreign key: it's polymorphic (it could point at any
-- of several tables), so integrity is enforced in the IPC handler (the target must exist)
-- and links are cleaned up when their entity is deleted. note_id IS a real FK, so deleting
-- a note removes its links automatically.
--
-- occurrence_date is only meaningful for class_meeting links: class_meetings are recurring
-- weekly rules, so this pins the note to one dated lecture (YYYY-MM-DD).

CREATE TABLE IF NOT EXISTS note_links (
  id              TEXT PRIMARY KEY,
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN
                    ('course', 'assignment', 'class_meeting', 'study_session', 'term')),
  entity_id       TEXT NOT NULL,
  occurrence_date TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_links_note   ON note_links(note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_entity ON note_links(entity_type, entity_id);
