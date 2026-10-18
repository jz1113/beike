package migrate

import (
	"os"
	"path/filepath"
	"testing"
)

func TestChecksumsMatchNodeLedger(t *testing.T) {
	want := map[string]string{
		"20260913_01_desktop_baseline":                         "c108512db8bd1bd145787d220ac013bb1d7533c6170ff3b130df9d8faf7a7962",
		"20260913_02_library_order_indexes":                    "5be8c7031bb2191647e9a6747a82bb16dc83f05718c943140406eb57d040c446",
		"20260915_01_asset_organization":                       "fb09704a01fc01da213b2989d98e6604c588fb9935bb09a0f4680a46f3897cc2",
		"20260915_02_deconstruct_review":                       "64907fd47bb7ca53ce19174984e071aa3ce258d52ea2aff8e86ed48e87fc67ea",
		"20260916_01_prompt_import_sources":                    "e1d50b41097fa74c5066c5c2568ffeb36ee0e5922b9bfcf7ee15bf81f611e52b",
		"20260916_02_workshop_workspace":                       "7643f033ade126cc73ecab1465b1600d5b3efa240263fb2f792782fa715816fd",
		"20260921_01_workshop_batches":                         "1e90f09cfde832529480eb6f244db65cfe83a0d33610b7637e5d5d7910a3609e",
		"20260921_02_content_prompt_groups":                    "21884f5fbb8c217137f7aa5e7fe7d8bcdd027a6c089c10ccae1c56f7a2b20670",
		"20260921_03_content_prompt_groups_repair":             "da413aadf95df4281525d930877c1d22648bb835cabc873051ad80feaf366bdb",
		"20260922_01_workshop_pipeline_assets":                 "2bc8634999379346d00f7026159469707497d675d16121786641872fbe3bbdfd",
		"20260922_02_workspace_isolation":                      "ab6bdec1826129a4d7223a47ad023664dd5d2e01dce474282e3806a6e8a7d73a",
		"20260923_01_keyword_review_rule_revisions":            "3be49e90388552ad3ee0304908a20b70d7051f6a40d42df00d704f4301609f7a",
		"20260924_01_keyword_lookup_cache":                     "1f41b0ab5843837345ae1c2ebc95ce0d420a371723138f7334f3459efc91f2a6",
		"20260929_01_full_prompt_display_numbers":              "07822473037847feb6fb2c39b87b0adda89218472fb984fdd345f6562770b513",
		"20260929_02_full_prompt_image_replacements":           "9e579a8331c8c495540bf4ffb9b840ac6350bf1b51ab32548f9befd32f8225ab",
		"20260929_03_full_prompt_product_subcategory":          "38fa728593148f8fdcd8cd35003a351a86d87ef7fd6482d1cc249e844061b672",
		"20260929_04_full_prompt_product_subcategory_backfill": "04567c47b3d6c86599191335b991f2ce6565faeab2c159632e0df910be2b34f7",
		"20260929_05_full_prompt_major_category_backfill":      "00a065fe3b41440acf17d730fbcc973ff1de469815bec454f7d68407c574da1a",
		"20260929_06_full_prompt_major_category_evidence":      "a2bb47477eefb4fcfe07ded2e981a0ef227e74fd3d3ae3b0b5112ff0e71b2aa6",
		"20260930_01_prompt_folder_archiving":                  "2f379136ca702bbf3702179f4cba83179538243a35a88869ada6029443d24f22",
		"20260930_02_deconstruct_background_jobs":              "18575b9cc31c8ab45645cba2564c85ce7dd63629071743cf5f6460af2c3fcd0f",
		"20261001_01_workspace_full_prompt_numbers":            "50b40901efbbb90f00694abde3a3ea0c6a8ca56353974698aa53f9929c4dae0d",
		"20261018_01_avatar_studio":                            "67904d61ea56444e812df3abb9eff00867ce1e27f458a729db6b5490db9e941b",
		"20261018_02_task_usage":                               "7a252a01e2e6f478d9dbd817b30ad4829d74f626c3f94100f08d4398fadf90d2",
	}
	items := mustMigrations()
	if len(items) != len(want) {
		t.Fatalf("versions %d", len(items))
	}
	for _, item := range items {
		if item.checksum != want[item.version] {
			t.Errorf("%s checksum %s", item.version, item.checksum)
		}
	}
	if !checksumAccepted(items[7], "e8c0ef1abaac4c4d6155e1fdeea6a2345ab6745bfc5b1791ffccfe08e6fafe8e") {
		t.Fatal("compatible checksum rejected")
	}
}

func TestEmptyDatabaseMigrates(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", "..", "..", "..", ".."))
	dir := t.TempDir()
	path := filepath.Join(dir, "empty.db")
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	if err := Run(path, root, false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}
