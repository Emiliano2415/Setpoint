-- Crear enum de categorías
CREATE TYPE movimiento_categoria AS ENUM (
  'fondo_inicial',
  'venta',
  'cancha',
  'reembolso',
  'retiro',
  'petty_cash',
  'propina',
  'ajuste',
  'otro'
);

-- Agregar columna a movimientos_caja (nullable para no romper registros existentes)
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS categoria movimiento_categoria;

-- Backfill: inferir categoria desde tipo y concepto existentes
UPDATE movimientos_caja SET categoria = 'fondo_inicial'
  WHERE tipo = 'fondo';

UPDATE movimientos_caja SET categoria = 'reembolso'
  WHERE tipo = 'egreso' AND concepto ILIKE '%reembolso%';

UPDATE movimientos_caja SET categoria = 'retiro'
  WHERE tipo = 'retiro';

UPDATE movimientos_caja SET categoria = 'propina'
  WHERE concepto ILIKE '%propina%';

UPDATE movimientos_caja SET categoria = 'petty_cash'
  WHERE tipo = 'egreso' AND categoria IS NULL;

UPDATE movimientos_caja SET categoria = 'venta'
  WHERE tipo = 'ingreso' AND categoria IS NULL;
