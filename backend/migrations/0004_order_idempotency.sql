ALTER TABLE orders ADD COLUMN checkout_token_hash TEXT;

CREATE UNIQUE INDEX idx_orders_checkout_token_hash
  ON orders(checkout_token_hash)
  WHERE checkout_token_hash IS NOT NULL;
