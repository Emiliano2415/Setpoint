-- ============================================================
-- Datos de demostración del módulo de Mantenimiento
-- (migración 20261029000003_mantenimiento.sql)
--
-- Para el club de demostración a0000000-…-0001. Se ejecuta DESPUÉS de las
-- migraciones y de seed.sql (necesita sus pistas y empleados):
--     psql "$DATABASE_URL_UNPOOLED" -f supabase/seed-mantenimiento.sql
--
-- Está aparte de la migración a propósito: la migración es idéntica en
-- cualquier base y no depende de que exista el club de demostración. El
-- catálogo global de las 6 NOM sí va en la migración.
--
-- Idempotente: si el club ya tiene órdenes de trabajo no hace nada. Las
-- fechas son relativas al día en que corre (hace N días), como seed.sql.
--
-- Estado que deja (coherente con los diseños de Stitch):
--   - 6 fichas técnicas; la Pista 4 sigue "en mantenimiento" (ya lo estaba)
--   - 7 tareas preventivas, 6 refacciones (2 en "Pedir")
--   - 8 órdenes: 5 correctivas cerradas con tiempos reales (MTTR 8.5 h),
--     1 preventiva en proceso con bloqueo (Pista 4), 2 correctivas abiertas
--   - 3 inspecciones: NOM-025 finalizada (1 "no cumple" -> OT-0007),
--     NOM-002 finalizada (100 %), NOM-029 en borrador
-- ============================================================

DO $seed$
DECLARE
  c_club   constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_tz     constant text := 'America/Mexico_City';
  c_admin  constant uuid := 'a2000000-0000-4000-8000-000000000002';  -- Carlos Rodríguez
  c_prop   constant uuid := 'a2000000-0000-4000-8000-000000000001';  -- Laura Méndez
  c_p1 constant uuid := 'a3000000-0000-4000-8000-000000000001';
  c_p2 constant uuid := 'a3000000-0000-4000-8000-000000000002';
  c_p3 constant uuid := 'a3000000-0000-4000-8000-000000000003';
  c_p4 constant uuid := 'a3000000-0000-4000-8000-000000000004';
  c_p5 constant uuid := 'a3000000-0000-4000-8000-000000000005';
  c_p6 constant uuid := 'a3000000-0000-4000-8000-000000000006';
  v_hoy    date := (now() AT TIME ZONE c_tz)::date;
  r_red uuid; r_lum uuid; r_drv uuid; r_cri uuid; r_are uuid; r_bis uuid;
  t_red uuid; t_cesp uuid; t_lux uuid; t_lum uuid; t_cri uuid; t_arena uuid; t_est uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid; o7 uuid; o8 uuid;
  v_rep timestamptz;
  v_ins uuid; v_n25 uuid; v_n02 uuid; v_n29 uuid; v_res uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pistas WHERE id = c_p1 AND club_id = c_club) THEN
    RAISE NOTICE 'seed-mantenimiento: no existe el club de demostración, no se carga nada';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM ordenes_trabajo WHERE club_id = c_club) THEN
    RAISE NOTICE 'seed-mantenimiento: el club ya tiene órdenes, no se carga nada';
    RETURN;
  END IF;

  -- ---------------------------------------------------------- Fichas técnicas
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 8.5,
    superficie = 'Césped sintético 12 mm con arena de sílice', superficie_instalada_en = DATE '2024-03-15',
    cerramiento = 'Cristal templado 12 mm y malla electrosoldada', luminarias_num = 8, luminaria_potencia_w = 200,
    lux_medido = 548, uniformidad = 0.78, medicion_en = v_hoy - 150, updated_at = now()
  WHERE pista_id = c_p1;
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 8.5,
    superficie = 'Césped sintético 12 mm con arena de sílice', superficie_instalada_en = DATE '2024-03-15',
    cerramiento = 'Cristal templado 12 mm y malla electrosoldada', luminarias_num = 8, luminaria_potencia_w = 200,
    lux_medido = 531, uniformidad = 0.75, medicion_en = v_hoy - 150, updated_at = now()
  WHERE pista_id = c_p2;
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 10,
    superficie = 'Césped sintético 12 mm con arena de sílice', superficie_instalada_en = DATE '2023-08-02',
    cerramiento = 'Cristal templado 10 mm y malla electrosoldada', luminarias_num = 6, luminaria_potencia_w = 250,
    lux_medido = 410, uniformidad = 0.62, medicion_en = v_hoy - 9, observaciones = 'Uniformidad por debajo de lo requerido en la medición de la inspección NOM-025',
    updated_at = now()
  WHERE pista_id = c_p3;
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 10,
    superficie = 'Césped sintético 10 mm', superficie_instalada_en = DATE '2021-06-20',
    cerramiento = 'Cristal templado 10 mm y malla electrosoldada', luminarias_num = 6, luminaria_potencia_w = 250,
    lux_medido = 395, uniformidad = 0.66, medicion_en = v_hoy - 150,
    observaciones = 'Superficie con más de 5 años: evaluar reposición', updated_at = now()
  WHERE pista_id = c_p4;
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 9,
    superficie = 'Césped sintético 12 mm con arena de sílice', superficie_instalada_en = DATE '2024-11-10',
    cerramiento = 'Cristal templado 12 mm y malla electrosoldada', luminarias_num = 8, luminaria_potencia_w = 180,
    lux_medido = 505, uniformidad = 0.74, medicion_en = v_hoy - 150, updated_at = now()
  WHERE pista_id = c_p5;
  UPDATE pista_ficha SET largo_m = 20, ancho_m = 10, altura_libre_m = 9,
    superficie = 'Césped sintético 12 mm con arena de sílice', superficie_instalada_en = DATE '2024-11-10',
    cerramiento = 'Cristal templado 12 mm y malla electrosoldada', luminarias_num = 8, luminaria_potencia_w = 180,
    lux_medido = 480, uniformidad = 0.70, medicion_en = v_hoy - 150, updated_at = now()
  WHERE pista_id = c_p6;
  -- La Pista 4 ya estaba en mantenimiento (seed.sql): la ficha lo refleja
  UPDATE pista_ficha SET estado_operativo = 'mantenimiento' WHERE pista_id = c_p4;

  -- ---------------------------------------------------------- Refacciones (entradas iniciales hace 100 días)
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Red reglamentaria de pádel', 'pza', 1, 7, 650, 'Deportes Técnicos del Norte') RETURNING id INTO r_red;
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Luminaria LED 200 W', 'pza', 2, 10, 1850, 'Iluminación Industrial MX') RETURNING id INTO r_lum;
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Driver / balastro LED', 'pza', 2, 12, 780, 'Iluminación Industrial MX') RETURNING id INTO r_drv;
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Panel de cristal templado 12 mm', 'pza', 1, 21, 5400, 'Vidrios y Cristales Monterrey') RETURNING id INTO r_cri;
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Arena de sílice (saco 25 kg)', 'saco', 20, 4, 140, 'Materiales Deportivos SA') RETURNING id INTO r_are;
  INSERT INTO refacciones (club_id, nombre, unidad, stock_seguridad, tiempo_entrega_dias, costo_unitario, proveedor)
  VALUES (c_club, 'Bisagra reforzada para puerta de pista', 'pza', 4, 6, 320, 'Herrajes del Bajío') RETURNING id INTO r_bis;

  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, motivo, empleado_id, created_at) VALUES
    (c_club, r_red, 'entrada', 3,  'Compra inicial', c_admin, now() - interval '100 days'),
    (c_club, r_lum, 'entrada', 6,  'Compra inicial', c_admin, now() - interval '100 days'),
    (c_club, r_drv, 'entrada', 3,  'Compra inicial', c_admin, now() - interval '100 days'),
    (c_club, r_cri, 'entrada', 2,  'Compra inicial', c_admin, now() - interval '100 days'),
    (c_club, r_are, 'entrada', 40, 'Compra inicial', c_admin, now() - interval '100 days'),
    (c_club, r_bis, 'entrada', 8,  'Compra inicial', c_admin, now() - interval '100 days');

  -- ---------------------------------------------------------- Tareas preventivas
  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Revisión de tensión y estado de la red', 'Verificar altura (88 cm al centro), tensión y desgaste de la red.',
          'red', true, '{}', 'semanas', 2, 20, false, c_admin,
          '["Medir la altura de la red al centro y en los postes","Ajustar la tensión con el tensor","Revisar costuras, banda superior y cable","Registrar la lectura en la bitácora"]',
          '[]',
          now() - interval '10 days', now() - interval '200 days')
  RETURNING id INTO t_red;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Cepillado y nivelación del césped sintético', 'Cepillar la fibra y repartir la arena de sílice.',
          'superficie', true, '{}', 'dias', 7, 45, true, c_admin,
          '["Retirar objetos y basura de la pista","Cepillar la fibra en sentido contrario al juego","Repartir y nivelar la arena de sílice","Revisar juntas y bordes levantados"]',
          jsonb_build_array(jsonb_build_object('refaccion_id', r_are, 'cantidad', 1)),
          now() - interval '9 days', now() - interval '200 days')
  RETURNING id INTO t_cesp;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Medición de iluminancia con luxómetro', 'Medición por cuadrícula en la superficie de juego (NOM-025).',
          'iluminacion', true, '{}', 'meses', 6, 60, true, c_prop,
          '["Esperar 15 min con las luminarias encendidas","Medir en la cuadrícula de puntos de la pista","Calcular promedio y uniformidad","Actualizar la ficha técnica de la pista"]',
          '[]', now() - interval '150 days', now() - interval '300 days')
  RETURNING id INTO t_lux;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Revisión de luminarias y drivers', 'Limpieza de luminarias, apriete de conexiones y prueba de drivers.',
          'iluminacion', false, ARRAY[c_p1, c_p2, c_p5], 'meses', 3, 90, true, c_admin,
          '["Desenergizar el circuito (bloqueo y etiquetado)","Limpiar difusores y luminarias","Apretar conexiones y revisar cableado","Probar encendido y registrar luminarias fallidas"]',
          jsonb_build_array(jsonb_build_object('refaccion_id', r_drv, 'cantidad', 1)),
          now() - interval '20 days', now() - interval '250 days')
  RETURNING id INTO t_lum;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Inspección de cristales y herrajes', 'Revisar fisuras, holguras y apriete de herrajes de los paneles.',
          'cristal', true, '{}', 'meses', 1, 40, false, c_admin,
          '["Revisar visualmente cada panel (fisuras, astillas)","Apretar herrajes y tornillería","Revisar sellos y juntas","Reportar cualquier panel dañado"]',
          '[]', now() - interval '24 days', now() - interval '250 days')
  RETURNING id INTO t_cri;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Reposición de arena y descompactado', 'Cada 500 horas de juego se repone arena y se descompacta la base.',
          'superficie', true, '{}', 'horas_uso', 500, 180, true, c_admin,
          '["Cepillar y aspirar la fibra","Descompactar con equipo de cepillado profundo","Reponer arena de sílice","Nivelar y verificar el rebote de la pelota"]',
          jsonb_build_array(jsonb_build_object('refaccion_id', r_are, 'cantidad', 6)),
          now() - interval '60 days', now() - interval '250 days')
  RETURNING id INTO t_arena;

  INSERT INTO tareas_preventivas (club_id, nombre, descripcion, componente, aplica_todas, pista_ids, frecuencia_tipo, frecuencia_valor,
                                  duracion_min, bloquea_agenda, responsable_id, pasos, refacciones, ultima_ejecucion, created_at)
  VALUES (c_club, 'Revisión de estructura, cerramiento y anclajes', 'Postes, mallas, anclajes y soldaduras del cerramiento (NOM-001).',
          'estructura', true, '{}', 'meses', 6, 120, true, c_prop,
          '["Revisar corrosión y soldaduras de postes","Verificar anclajes al piso","Revisar tensión de la malla","Pintar zonas con óxido"]',
          '[]', now() - interval '60 days', now() - interval '300 days')
  RETURNING id INTO t_est;

  -- ---------------------------------------------------------- Órdenes cerradas (correctivas, con tiempos reales)
  -- OT-0001  Pista 2 · iluminación · fuera de servicio 5 h 30 min
  v_rep := (v_hoy - 26 + time '19:10') AT TIME ZONE c_tz;
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, iniciada_en, cerrada_en, causa, accion_realizada, costo_mano_obra)
  VALUES (c_club, 'correctiva', c_p2, 'iluminacion', 'Se apagó la mitad de las luminarias durante un partido', 'alta', 'cerrada', true,
          c_admin, c_admin, v_rep, v_rep + interval '35 minutes', v_rep + interval '5 hours 30 minutes',
          'Driver LED quemado por sobrecalentamiento', 'Se sustituyó el driver y se verificó el encendido de las 8 luminarias', 350)
  RETURNING id INTO o1;
  INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
  VALUES (c_club, c_p2, 'fuera_de_servicio', v_rep, v_rep + interval '5 hours 30 minutes', 'OT-0001 · Luminarias apagadas', o1, c_admin);
  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
  VALUES (c_club, r_drv, 'salida', 1, o1, 'Orden OT-0001', c_admin, v_rep + interval '5 hours 30 minutes');

  -- OT-0002  Pista 3 · cristal · fuera de servicio 26 h (espera de la pieza)
  v_rep := (v_hoy - 21 + time '10:20') AT TIME ZONE c_tz;
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, iniciada_en, cerrada_en, causa, accion_realizada, costo_mano_obra)
  VALUES (c_club, 'correctiva', c_p3, 'cristal', 'Panel de cristal fisurado en la esquina del fondo', 'alta', 'cerrada', true,
          c_prop, c_admin, v_rep, v_rep + interval '3 hours', v_rep + interval '26 hours',
          'Impacto de pelota sobre un herraje flojo', 'Se cambió el panel y se apretaron los herrajes de los paneles contiguos', 600)
  RETURNING id INTO o2;
  INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
  VALUES (c_club, c_p3, 'fuera_de_servicio', v_rep, v_rep + interval '26 hours', 'OT-0002 · Cristal fisurado', o2, c_prop);
  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
  VALUES (c_club, r_cri, 'salida', 1, o2, 'Orden OT-0002', c_admin, v_rep + interval '26 hours');

  -- OT-0003  Pista 5 · red · sin paro
  v_rep := (v_hoy - 15 + time '16:05') AT TIME ZONE c_tz;
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, iniciada_en, cerrada_en, causa, accion_realizada, costo_mano_obra)
  VALUES (c_club, 'correctiva', c_p5, 'red', 'La red tiene la banda superior rota', 'baja', 'cerrada', false,
          c_admin, c_admin, v_rep, v_rep + interval '1 hour', v_rep + interval '3 hours',
          'Desgaste normal de la banda por uso', 'Se reemplazó la red completa y se ajustó la tensión', 150)
  RETURNING id INTO o3;
  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
  VALUES (c_club, r_red, 'salida', 1, o3, 'Orden OT-0003', c_admin, v_rep + interval '3 hours');

  -- OT-0004  Pista 1 · superficie · fuera de servicio 8 h
  v_rep := (v_hoy - 11 + time '08:30') AT TIME ZONE c_tz;
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, iniciada_en, cerrada_en, causa, accion_realizada, costo_mano_obra)
  VALUES (c_club, 'correctiva', c_p1, 'superficie', 'Junta del césped levantada y zona sin arena en el fondo', 'media', 'cerrada', true,
          c_admin, c_admin, v_rep, v_rep + interval '1 hour', v_rep + interval '8 hours',
          'Adhesivo de la junta vencido y arena desplazada por el juego', 'Se pegó la junta, se repuso arena y se nivelaron 12 m²', 800)
  RETURNING id INTO o4;
  INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
  VALUES (c_club, c_p1, 'fuera_de_servicio', v_rep, v_rep + interval '8 hours', 'OT-0004 · Junta levantada', o4, c_admin);
  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
  VALUES (c_club, r_are, 'salida', 6, o4, 'Orden OT-0004', c_admin, v_rep + interval '8 hours');

  -- OT-0005  Pista 6 · puerta · sin paro
  v_rep := (v_hoy - 6 + time '12:15') AT TIME ZONE c_tz;
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, iniciada_en, cerrada_en, causa, accion_realizada, costo_mano_obra)
  VALUES (c_club, 'correctiva', c_p6, 'puerta', 'La puerta de la pista no cierra bien', 'media', 'cerrada', false,
          c_admin, c_admin, v_rep, v_rep + interval '30 minutes', v_rep + interval '2 hours 30 minutes',
          'Bisagras desgastadas', 'Se cambiaron las dos bisagras y se alineó el pestillo', 200)
  RETURNING id INTO o5;
  INSERT INTO movimientos_refaccion (club_id, refaccion_id, tipo, cantidad, orden_id, motivo, empleado_id, created_at)
  VALUES (c_club, r_bis, 'salida', 2, o5, 'Orden OT-0005', c_admin, v_rep + interval '2 hours 30 minutes');

  -- El costo de refacciones sale de los movimientos (cantidad x costo unitario)
  UPDATE ordenes_trabajo o
     SET costo_refacciones = COALESCE((SELECT sum(m.cantidad * m.costo_unitario) FROM movimientos_refaccion m
                                       WHERE m.orden_id = o.id AND m.tipo = 'salida'), 0)
   WHERE o.club_id = c_club AND o.id IN (o1, o2, o3, o4, o5);

  -- ---------------------------------------------------------- Órdenes abiertas y inspecciones
  -- OT-0006  Pista 4 · preventiva en proceso con bloqueo (cambio de red y revisión del césped)
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, responsable_id, reportada_en, programada_para, iniciada_en, tarea_preventiva_id)
  VALUES (c_club, 'preventiva', c_p4, 'red', 'Cambio de red y revisión del césped', 'media', 'en_proceso', true,
          c_admin, c_admin, now() - interval '2 days', now() - interval '3 hours', now() - interval '3 hours', t_red)
  RETURNING id INTO o6;
  INSERT INTO bloqueos_pista (club_id, pista_id, tipo, inicio, fin, motivo, orden_id, creado_por)
  VALUES (c_club, c_p4, 'preventivo', now() - interval '3 hours', now() + interval '20 hours',
          'OT-0006 · Cambio de red y revisión del césped', o6, c_admin);

  -- ---------------------------------------------------------- Inspecciones
  SELECT id INTO v_n25 FROM normas WHERE codigo = 'NOM-025-STPS-2008' AND club_id IS NULL;
  SELECT id INTO v_n02 FROM normas WHERE codigo = 'NOM-002-STPS-2010' AND club_id IS NULL;
  SELECT id INTO v_n29 FROM normas WHERE codigo = 'NOM-029-STPS-2011' AND club_id IS NULL;

  -- NOM-025 finalizada hace 9 días: 1 "no cumple" (uniformidad en la Pista 3) y 1 "n/a"
  INSERT INTO inspecciones (club_id, norma_id, pista_id, fecha, responsable_id, estado, observaciones, finalizada_en, created_at)
  VALUES (c_club, v_n25, NULL, v_hoy - 9, c_admin, 'finalizada', 'Medición anual de iluminación de las 6 pistas',
          (v_hoy - 9 + time '13:00') AT TIME ZONE c_tz, (v_hoy - 9 + time '10:00') AT TIME ZONE c_tz)
  RETURNING id INTO v_ins;
  INSERT INTO inspeccion_resultados (club_id, inspeccion_id, punto_id, resultado, observacion)
  SELECT c_club, v_ins, pt.id,
         CASE pt.orden WHEN 2 THEN 'no_cumple' WHEN 5 THEN 'na' ELSE 'cumple' END,
         CASE pt.orden WHEN 2 THEN 'Pista 3: uniformidad 0.62, por debajo de lo requerido (lux medido 410)'
                       WHEN 5 THEN 'Pistas cubiertas, sin luz natural directa' END
  FROM norma_puntos pt WHERE pt.norma_id = v_n25 ORDER BY pt.orden;

  -- OT-0007 nace de ese "no cumple"
  SELECT id INTO v_res FROM inspeccion_resultados WHERE inspeccion_id = v_ins AND resultado = 'no_cumple';
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, reportada_en, inspeccion_id, inspeccion_resultado_id)
  VALUES (c_club, 'correctiva', c_p3, 'iluminacion',
          'NOM-025-STPS-2008 · Uniformidad de iluminancia aceptable en la superficie de juego — Pista 3: uniformidad 0.62, por debajo de lo requerido',
          'media', 'abierta', false, c_admin, (v_hoy - 9 + time '13:00') AT TIME ZONE c_tz, v_ins, v_res)
  RETURNING id INTO o7;

  -- OT-0008  Pista 6 · correctiva abierta (poste flojo)
  INSERT INTO ordenes_trabajo (club_id, tipo, pista_id, componente, descripcion, prioridad, estado, fuera_de_servicio,
                               reportada_por, reportada_en)
  VALUES (c_club, 'correctiva', c_p6, 'estructura', 'Poste del cerramiento flojo en el lado derecho', 'alta', 'abierta', false,
          c_admin, now() - interval '1 day')
  RETURNING id INTO o8;

  -- NOM-002 finalizada hace 95 días, sin hallazgos
  INSERT INTO inspecciones (club_id, norma_id, pista_id, fecha, responsable_id, estado, observaciones, finalizada_en, created_at)
  VALUES (c_club, v_n02, NULL, v_hoy - 95, c_prop, 'finalizada', 'Revisión anual de protección contra incendios',
          (v_hoy - 95 + time '12:00') AT TIME ZONE c_tz, (v_hoy - 95 + time '09:30') AT TIME ZONE c_tz)
  RETURNING id INTO v_ins;
  INSERT INTO inspeccion_resultados (club_id, inspeccion_id, punto_id, resultado, observacion)
  SELECT c_club, v_ins, pt.id, CASE pt.orden WHEN 6 THEN 'na' ELSE 'cumple' END,
         CASE pt.orden WHEN 6 THEN 'El club no almacena líquidos inflamables' END
  FROM norma_puntos pt WHERE pt.norma_id = v_n02 ORDER BY pt.orden;

  -- NOM-029 en borrador (ayer): 4 de 8 puntos evaluados
  INSERT INTO inspecciones (club_id, norma_id, pista_id, fecha, responsable_id, estado, observaciones, created_at)
  VALUES (c_club, v_n29, NULL, v_hoy - 1, c_admin, 'borrador', 'Revisión eléctrica anual, en curso',
          (v_hoy - 1 + time '16:00') AT TIME ZONE c_tz)
  RETURNING id INTO v_ins;
  INSERT INTO inspeccion_resultados (club_id, inspeccion_id, punto_id, resultado, observacion)
  SELECT c_club, v_ins, pt.id,
         CASE pt.orden WHEN 1 THEN 'cumple' WHEN 2 THEN 'cumple' WHEN 3 THEN 'cumple' WHEN 4 THEN 'no_cumple' END,
         CASE pt.orden WHEN 4 THEN 'Cable de la luminaria 3 de la Pista 6 sin canalizar en el tramo del poste' END
  FROM norma_puntos pt WHERE pt.norma_id = v_n29 ORDER BY pt.orden;

  RAISE NOTICE 'seed-mantenimiento: cargado';
END
$seed$;
