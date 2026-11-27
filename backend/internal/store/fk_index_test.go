package store_test

import (
	"context"
	"testing"
)

// TestEveryForeignKeyIndexed (#555): deleting a parent row makes Postgres look
// up the child rows (CASCADE / SET NULL / RESTRICT), and without an index whose
// leading columns are the FK's own that lookup scans the whole child table. A
// partial index counts only when its predicate is `<first column> IS NOT NULL`,
// which every FK lookup implies.
func TestEveryForeignKeyIndexed(t *testing.T) {
	s := testStore(t)
	rows, err := s.RawDB().Query(context.Background(), `
		SELECT c.conrelid::regclass::text, c.conname
		FROM pg_constraint c
		WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
		  AND NOT EXISTS (
		    SELECT 1 FROM pg_index i
		    WHERE i.indrelid = c.conrelid
		      AND (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
		      AND (i.indpred IS NULL
		           OR pg_get_expr(i.indpred, i.indrelid) = format('(%I IS NOT NULL)',
		                (SELECT a.attname FROM pg_attribute a
		                 WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]))))
		ORDER BY 1, 2`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var table, name string
		if err := rows.Scan(&table, &name); err != nil {
			t.Fatal(err)
		}
		t.Errorf("foreign key %s on %s has no index on its columns; add one in a new migration", name, table)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
}
