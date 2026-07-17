PRAGMA foreign_keys = ON;

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  collection TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  badge TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  option1_label TEXT NOT NULL DEFAULT 'Talla',
  option2_label TEXT NOT NULL DEFAULT 'Color',
  image TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE product_options (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL CHECK (option_index IN (1, 2)),
  value TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, option_index, value)
);

CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  option1_value TEXT NOT NULL,
  option2_value TEXT NOT NULL,
  shared_stock INTEGER NOT NULL DEFAULT 0 CHECK (shared_stock IN (0, 1)),
  stock INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at INTEGER NOT NULL,
  UNIQUE (product_id, option1_value, option2_value, shared_stock)
);

CREATE TRIGGER product_variants_nonnegative_insert
BEFORE INSERT ON product_variants
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'insufficient_stock');
END;

CREATE TRIGGER product_variants_nonnegative_update
BEFORE UPDATE OF stock ON product_variants
WHEN NEW.stock < 0
BEGIN
  SELECT RAISE(ABORT, 'insufficient_stock');
END;

CREATE TRIGGER inactive_variants_cannot_be_reserved
BEFORE UPDATE OF stock ON product_variants
WHEN OLD.active = 0 AND NEW.stock < OLD.stock
BEGIN
  SELECT RAISE(ABORT, 'inactive_variant');
END;

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'nuevo' CHECK (status IN ('nuevo', 'confirmado', 'pagado', 'enviado', 'cerrado', 'cancelado')),
  channel TEXT NOT NULL DEFAULT 'instagram',
  customer_name TEXT NOT NULL,
  customer_instagram TEXT NOT NULL,
  customer_city TEXT NOT NULL,
  customer_delivery TEXT NOT NULL,
  customer_payment TEXT NOT NULL,
  customer_notes TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL CHECK (total >= 0),
  inventory_state TEXT NOT NULL DEFAULT 'reserved' CHECK (inventory_state IN ('reserved', 'restored')),
  inventory_reserved_at INTEGER NOT NULL,
  inventory_restored_at INTEGER,
  archived_at INTEGER
);

CREATE TRIGGER cancelled_order_is_terminal
BEFORE UPDATE OF status ON orders
WHEN OLD.status = 'cancelado' AND NEW.status <> 'cancelado'
BEGIN
  SELECT RAISE(ABORT, 'cancelled_order_is_terminal');
END;

CREATE TRIGGER restored_inventory_is_terminal
BEFORE UPDATE OF inventory_state ON orders
WHEN OLD.inventory_state = 'restored' AND NEW.inventory_state <> 'restored'
BEGIN
  SELECT RAISE(ABORT, 'restored_inventory_is_terminal');
END;

CREATE TRIGGER orders_are_never_physically_deleted
BEFORE DELETE ON orders
BEGIN
  SELECT RAISE(ABORT, 'orders_must_be_archived');
END;

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL,
  color TEXT NOT NULL,
  option1_label TEXT NOT NULL,
  option2_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  image TEXT NOT NULL DEFAULT ''
);

CREATE TABLE inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('reserve', 'restore_cancel', 'restore_archive')),
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  created_at INTEGER NOT NULL,
  UNIQUE (order_id, variant_id, kind)
);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed', 'cancelled', 'archived')),
  from_status TEXT,
  to_status TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  scope TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  reset_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, client_hash)
);

CREATE INDEX idx_products_catalog ON products (deleted_at, active, category, collection);
CREATE INDEX idx_product_options_product ON product_options (product_id, option_index, sort_order);
CREATE INDEX idx_product_variants_product ON product_variants (product_id, active, option1_value, option2_value);
CREATE INDEX idx_orders_admin ON orders (archived_at, created_at DESC);
CREATE INDEX idx_orders_status ON orders (status, archived_at, updated_at DESC);
CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_inventory_movements_order ON inventory_movements (order_id, created_at);
CREATE INDEX idx_order_events_order ON order_events (order_id, created_at);
CREATE INDEX idx_admin_sessions_expiry ON admin_sessions (expires_at);
CREATE INDEX idx_rate_limits_expiry ON rate_limits (reset_at);
