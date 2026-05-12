-- ============================================
-- Contact Center Analytics - Diagrama Turnos Mayo 2026
-- ============================================

-- 1. Modificar la restricción para permitir 'C' (Cortado)
ALTER TABLE cc_shifts DROP CONSTRAINT IF EXISTS cc_shifts_shift_type_check;
ALTER TABLE cc_shifts ADD CONSTRAINT cc_shifts_shift_type_check CHECK (shift_type IN ('M', 'T', 'I', 'V', 'F', 'C'));

-- 2. Insertar los turnos de Mayo 2026
-- Week 1: May 4 to May 8
-- Sofia: M, Antonella: T, Virginia: C, Daniela: I
INSERT INTO cc_shifts (agent_name, shift_date, shift_type) VALUES
('Sofia', '2026-05-04', 'M'), ('Antonella', '2026-05-04', 'T'), ('Virginia', '2026-05-04', 'C'), ('Daniela', '2026-05-04', 'I'),
('Sofia', '2026-05-05', 'M'), ('Antonella', '2026-05-05', 'T'), ('Virginia', '2026-05-05', 'C'), ('Daniela', '2026-05-05', 'I'),
('Sofia', '2026-05-06', 'M'), ('Antonella', '2026-05-06', 'T'), ('Virginia', '2026-05-06', 'C'), ('Daniela', '2026-05-06', 'I'),
('Sofia', '2026-05-07', 'M'), ('Antonella', '2026-05-07', 'T'), ('Virginia', '2026-05-07', 'C'), ('Daniela', '2026-05-07', 'I'),
('Sofia', '2026-05-08', 'M'), ('Antonella', '2026-05-08', 'T'), ('Virginia', '2026-05-08', 'C'), ('Daniela', '2026-05-08', 'I')
ON CONFLICT (agent_name, shift_date) DO UPDATE SET shift_type = EXCLUDED.shift_type;

-- Week 2: May 11 to May 15
-- Sofia: T, Antonella: M, Virginia: C, Daniela: I
INSERT INTO cc_shifts (agent_name, shift_date, shift_type) VALUES
('Sofia', '2026-05-11', 'T'), ('Antonella', '2026-05-11', 'M'), ('Virginia', '2026-05-11', 'C'), ('Daniela', '2026-05-11', 'I'),
('Sofia', '2026-05-12', 'T'), ('Antonella', '2026-05-12', 'M'), ('Virginia', '2026-05-12', 'C'), ('Daniela', '2026-05-12', 'I'),
('Sofia', '2026-05-13', 'T'), ('Antonella', '2026-05-13', 'M'), ('Virginia', '2026-05-13', 'C'), ('Daniela', '2026-05-13', 'I'),
('Sofia', '2026-05-14', 'T'), ('Antonella', '2026-05-14', 'M'), ('Virginia', '2026-05-14', 'C'), ('Daniela', '2026-05-14', 'I'),
('Sofia', '2026-05-15', 'T'), ('Antonella', '2026-05-15', 'M'), ('Virginia', '2026-05-15', 'C'), ('Daniela', '2026-05-15', 'I')
ON CONFLICT (agent_name, shift_date) DO UPDATE SET shift_type = EXCLUDED.shift_type;

-- Week 3: May 18 to May 22
-- Sofia: M, Antonella: T, Virginia: C, Daniela: I
INSERT INTO cc_shifts (agent_name, shift_date, shift_type) VALUES
('Sofia', '2026-05-18', 'M'), ('Antonella', '2026-05-18', 'T'), ('Virginia', '2026-05-18', 'C'), ('Daniela', '2026-05-18', 'I'),
('Sofia', '2026-05-19', 'M'), ('Antonella', '2026-05-19', 'T'), ('Virginia', '2026-05-19', 'C'), ('Daniela', '2026-05-19', 'I'),
('Sofia', '2026-05-20', 'M'), ('Antonella', '2026-05-20', 'T'), ('Virginia', '2026-05-20', 'C'), ('Daniela', '2026-05-20', 'I'),
('Sofia', '2026-05-21', 'M'), ('Antonella', '2026-05-21', 'T'), ('Virginia', '2026-05-21', 'C'), ('Daniela', '2026-05-21', 'I'),
('Sofia', '2026-05-22', 'M'), ('Antonella', '2026-05-22', 'T'), ('Virginia', '2026-05-22', 'C'), ('Daniela', '2026-05-22', 'I')
ON CONFLICT (agent_name, shift_date) DO UPDATE SET shift_type = EXCLUDED.shift_type;

-- Week 4: May 26 to May 29 (May 25 is holiday)
-- Sofia: T, Antonella: M, Virginia: C, Daniela: I
INSERT INTO cc_shifts (agent_name, shift_date, shift_type) VALUES
('Sofia', '2026-05-26', 'T'), ('Antonella', '2026-05-26', 'M'), ('Virginia', '2026-05-26', 'C'), ('Daniela', '2026-05-26', 'I'),
('Sofia', '2026-05-27', 'T'), ('Antonella', '2026-05-27', 'M'), ('Virginia', '2026-05-27', 'C'), ('Daniela', '2026-05-27', 'I'),
('Sofia', '2026-05-28', 'T'), ('Antonella', '2026-05-28', 'M'), ('Virginia', '2026-05-28', 'C'), ('Daniela', '2026-05-28', 'I'),
('Sofia', '2026-05-29', 'T'), ('Antonella', '2026-05-29', 'M'), ('Virginia', '2026-05-29', 'C'), ('Daniela', '2026-05-29', 'I')
ON CONFLICT (agent_name, shift_date) DO UPDATE SET shift_type = EXCLUDED.shift_type;
