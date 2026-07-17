CREATE TABLE featured_drops (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  image_alt TEXT NOT NULL,
  top_label TEXT NOT NULL,
  bottom_label TEXT NOT NULL,
  card_brand TEXT NOT NULL,
  card_footer_left TEXT NOT NULL,
  card_footer_right TEXT NOT NULL,
  vertical_label TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'none' CHECK (target_type IN ('none', 'product', 'collection')),
  target_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'hidden', 'archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  CHECK (
    (target_type = 'none' AND target_id IS NULL)
    OR (target_type IN ('product', 'collection') AND target_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_featured_drops_single_published
  ON featured_drops(status)
  WHERE status = 'published';

CREATE INDEX idx_featured_drops_history
  ON featured_drops(updated_at DESC, created_at DESC);

CREATE INDEX idx_featured_drops_target
  ON featured_drops(target_type, target_id);
