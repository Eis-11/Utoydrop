CREATE TABLE catalog_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

INSERT INTO catalog_state (id, revision, updated_at) VALUES (1, 0, 0);

CREATE TRIGGER catalog_revision_must_not_be_negative
BEFORE UPDATE OF revision ON catalog_state
WHEN NEW.revision < 0
BEGIN
  SELECT RAISE(ABORT, 'catalog_revision_conflict');
END;
