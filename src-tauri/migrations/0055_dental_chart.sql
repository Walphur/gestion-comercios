-- Ficha dental interna del consultorio. No es un diagnóstico ni una historia clínica.
CREATE TABLE IF NOT EXISTS dental_chart_marks (
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tooth INTEGER NOT NULL CHECK (
    (tooth BETWEEN 11 AND 18)
    OR (tooth BETWEEN 21 AND 28)
    OR (tooth BETWEEN 31 AND 38)
    OR (tooth BETWEEN 41 AND 48)
  ),
  status TEXT NOT NULL CHECK (status IN ('arreglado', 'a_tratar', 'extraido')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (customer_id, tooth)
);
