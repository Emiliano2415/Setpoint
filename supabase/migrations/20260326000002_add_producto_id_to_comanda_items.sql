ALTER TABLE comanda_items ADD COLUMN IF NOT EXISTS producto_id UUID REFERENCES productos(id);
