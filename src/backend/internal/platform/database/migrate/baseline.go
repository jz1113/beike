package migrate

import (
	"context"
	"fmt"
	"regexp"
	"strings"
)

type baselineTable struct {
	name    string
	columns []baselineColumn
	sql     string
}

type baselineColumn struct {
	name       string
	definition string
}

var (
	baselineTableName     = regexp.MustCompile(`^CREATE TABLE "(\w+)"`)
	baselineColumnPattern = regexp.MustCompile(`^\s+"(\w+)" (.+?)(?:,)?$`)
	baselineIndex         = regexp.MustCompile(`^CREATE (UNIQUE )?INDEX`)
	unsafeColumn          = regexp.MustCompile(`PRIMARY KEY|UNIQUE|CURRENT_TIMESTAMP`)
	notNullColumn         = regexp.MustCompile(`NOT NULL`)
	defaultColumn         = regexp.MustCompile(`DEFAULT `)
)

func parseBaseline(script string) (tables []baselineTable, indexes []string) {
	stripped := regexp.MustCompile(`(?m)^--.*$`).ReplaceAllString(script, "")
	for _, statement := range splitSQL(stripped) {
		if name := baselineTableName.FindStringSubmatch(statement); name != nil {
			var columns []baselineColumn
			for _, line := range strings.Split(statement, "\n") {
				match := baselineColumnPattern.FindStringSubmatch(line)
				if match == nil {
					continue
				}
				columns = append(columns, baselineColumn{name: match[1], definition: match[2]})
			}
			tables = append(tables, baselineTable{name: name[1], columns: columns, sql: statement})
			continue
		}
		if baselineIndex.MatchString(statement) {
			indexes = append(indexes, replaceFirst(statement, "INDEX ", "INDEX IF NOT EXISTS "))
		}
	}
	return tables, indexes
}

func applyBaseline(ctx context.Context, db execer) error {
	tables, indexes := parseBaseline(sourceText("baseline.sql"))
	for _, table := range tables {
		existing, err := columnNames(ctx, db, table.name)
		if err != nil {
			return err
		}
		if len(existing) == 0 {
			if err := exec(ctx, db, table.sql); err != nil {
				return err
			}
			continue
		}
		have := map[string]bool{}
		for _, name := range existing {
			have[name] = true
		}
		for _, column := range table.columns {
			if have[column.name] {
				continue
			}
			if unsafeColumn.MatchString(column.definition) || (notNullColumn.MatchString(column.definition) && !defaultColumn.MatchString(column.definition)) {
				return fmt.Errorf("Database upgrade requires an explicit migration for %s.%s", table.name, column.name)
			}
			if err := exec(ctx, db, fmt.Sprintf(`ALTER TABLE %s ADD COLUMN %s %s`, ident(table.name), ident(column.name), column.definition)); err != nil {
				return err
			}
		}
	}
	for _, statement := range indexes {
		if err := exec(ctx, db, statement); err != nil {
			return err
		}
	}
	return nil
}

func verifyBaseline(ctx context.Context, db execer) error {
	tables, _ := parseBaseline(sourceText("baseline.sql"))
	for _, table := range tables {
		info, err := columnNames(ctx, db, table.name)
		if err != nil {
			return err
		}
		have := map[string]bool{}
		for _, name := range info {
			have[name] = true
		}
		for _, column := range table.columns {
			if !have[column.name] {
				return fmt.Errorf("Database schema is incomplete: %s.%s", table.name, column.name)
			}
		}
	}
	rows, err := db.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		return fmt.Errorf("Database has broken foreign key references; restore or repair before startup")
	}
	return rows.Err()
}
