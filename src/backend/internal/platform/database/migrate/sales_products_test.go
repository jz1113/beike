package migrate

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	salesProductsVersion       = "20261101_04_sales_products"
	salesProductsChecksum      = "d4d1662678a00d3637cefdc74d70ac4bfc3e7ce099a9fd12b5f5543916f69c31"
	salesProductsShortChecksum = "4302ee43d4b71f31bb17a7a359fcff9863688987cbe66e46f7e274404a8e2db3"
)

func TestSalesProductsChecksumsDifferOnlyByTrailingBlankLine(t *testing.T) {
	source := sourceText("sales_products.sql")
	withoutBlankLine := strings.TrimRight(source, "\n") + "\n"
	withBlankLine := withoutBlankLine + "\n"
	if sha256Hex(withoutBlankLine) != salesProductsShortChecksum {
		t.Fatal("published single-newline source changed")
	}
	if sha256Hex(withBlankLine) != salesProductsChecksum {
		t.Fatal("published trailing-blank-line source changed")
	}
	if source != withBlankLine {
		t.Fatal("restored published source must retain its trailing blank line")
	}
}

func TestSalesProductsMigrationLedgerCompatibilityPreservesUserData(t *testing.T) {
	for _, test := range []struct {
		name, version, checksum string
		accepted                bool
	}{
		{"published", salesProductsVersion, salesProductsChecksum, true},
		{"without trailing blank line", salesProductsVersion, salesProductsShortChecksum, true},
		{"unknown checksum", salesProductsVersion, strings.Repeat("0", 64), false},
		{"unknown version", "20990101_01_unknown", salesProductsChecksum, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			root := t.TempDir()
			path := filepath.Join(root, "products.db")
			db, err := sql.Open("sqlite", path)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if err := applyPending(context.Background(), db, mustMigrations()); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`INSERT INTO "SalesProduct"
				("id","workspaceId","title","productUrl","coverUrl","imageCount","outputCount","draftJson","createdAt","updatedAt")
				VALUES ('user-product','user-workspace','保留商品','https://example.com/product','/storage/user.jpg',3,2,'{"custom":"保留草稿"}','created','updated')`); err != nil {
				t.Fatal(err)
			}
			if _, err := db.Exec(`UPDATE "_BeikeMigration" SET "version"=?, "checksum"=? WHERE "version"=?`, test.version, test.checksum, salesProductsVersion); err != nil {
				t.Fatal(err)
			}
			productsBefore := salesProductsTestRows(t, db, `SELECT * FROM "SalesProduct" ORDER BY "id"`)
			ledgerBefore := salesProductsTestRows(t, db, `SELECT * FROM "_BeikeMigration" ORDER BY "version"`)
			err = Run(path, root, false)
			if test.accepted {
				if err != nil {
					t.Fatalf("known equivalent checksum rejected: %v", err)
				}
			} else if err == nil || !strings.Contains(err.Error(), "Database migration version mismatch: "+test.version) {
				t.Fatalf("unknown migration must be rejected, got %v", err)
			}
			if after := salesProductsTestRows(t, db, `SELECT * FROM "SalesProduct" ORDER BY "id"`); !reflect.DeepEqual(productsBefore, after) {
				t.Fatalf("user product changed: before=%v after=%v", productsBefore, after)
			}
			if after := salesProductsTestRows(t, db, `SELECT * FROM "_BeikeMigration" ORDER BY "version"`); !reflect.DeepEqual(ledgerBefore, after) {
				t.Fatalf("migration ledger was rewritten: before=%v after=%v", ledgerBefore, after)
			}
		})
	}
}

func salesProductsTestRows(t *testing.T, db *sql.DB, query string) [][]any {
	t.Helper()
	rows, err := db.Query(query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	var result [][]any
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			t.Fatal(err)
		}
		result = append(result, values)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	return result
}
