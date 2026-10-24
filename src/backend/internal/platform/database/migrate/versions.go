package migrate

import (
	"context"
	"embed"
	"fmt"
	"strings"
)

//go:embed sources
var sourceFS embed.FS

func sourceText(name string) string {
	raw, err := sourceFS.ReadFile("sources/" + name)
	if err != nil {
		panic(err)
	}
	return strings.ReplaceAll(string(raw), "\r\n", "\n")
}

type migration struct {
	version    string
	checksum   string
	compatible []string
	apply      func(context.Context, execer) error
}

func mustMigrations() []migration {
	label := func(text string) string { return sha256Hex(text) }
	file := func(name string) string { return sha256Hex(sourceText(name)) }
	script := func(name string, skipAlter bool) func(context.Context, execer) error {
		return func(ctx context.Context, db execer) error {
			return execScript(ctx, db, sourceText(name), skipAlter)
		}
	}
	return []migration{
		{version: "20260913_01_desktop_baseline", checksum: file("baseline.sql"), apply: applyBaseline},
		{version: "20260913_02_library_order_indexes", checksum: file("library_indexes.sql"), apply: script("library_indexes.sql", false)},
		{version: "20260915_01_asset_organization", checksum: file("organization.txt"), apply: applyAssetOrganization},
		{version: "20260915_02_deconstruct_review", checksum: file("deconstruct_review.sql"), apply: script("deconstruct_review.sql", false)},
		{version: "20260916_01_prompt_import_sources", checksum: file("prompt_import_source.sql"), apply: script("prompt_import_source.sql", false)},
		{version: "20260916_02_workshop_workspace", checksum: file("workshop_workspace.sql"), apply: script("workshop_workspace.sql", false)},
		{version: "20260921_01_workshop_batches", checksum: file("workshop_batches.sql"), apply: script("workshop_batches.sql", false)},
		{version: "20260921_02_content_prompt_groups", checksum: file("content_prompt_groups.sql"), compatible: []string{"e8c0ef1abaac4c4d6155e1fdeea6a2345ab6745bfc5b1791ffccfe08e6fafe8e"}, apply: applyContentPromptGroups},
		{version: "20260921_03_content_prompt_groups_repair", checksum: label("content-prompt-groups-repair-v1"), apply: applyContentPromptGroups},
		{version: "20260922_01_workshop_pipeline_assets", checksum: file("workshop_pipeline.sql"), apply: script("workshop_pipeline.sql", true)},
		{version: "20260922_02_workspace_isolation", checksum: label("workspace-isolation-v1"), apply: applyWorkspaceIsolation},
		{version: "20260923_01_keyword_review_rule_revisions", checksum: file("keyword_rules.sql"), apply: script("keyword_rules.sql", false)},
		{version: "20260924_01_keyword_lookup_cache", checksum: file("keyword_cache.sql"), apply: script("keyword_cache.sql", false)},
		{version: "20260929_01_full_prompt_display_numbers", checksum: label("full-prompt-display-numbers-v1"), apply: applyFullPromptDisplayNumbers},
		{version: "20260929_02_full_prompt_image_replacements", checksum: file("image_replacement.sql"), apply: script("image_replacement.sql", false)},
		{version: "20260929_03_full_prompt_product_subcategory", checksum: file("product_subcategory.sql"), apply: applyProductSubcategory},
		{version: "20260929_04_full_prompt_product_subcategory_backfill", checksum: label("full-prompt-product-subcategory-four-shot-inference-v1"), apply: applySubcategoryBackfill},
		{version: "20260929_05_full_prompt_major_category_backfill", checksum: label("full-prompt-major-category-explicit-digital-v1"), apply: applyMajorCategoryBackfill},
		{version: "20260929_06_full_prompt_major_category_evidence", checksum: label("full-prompt-major-category-title-and-two-shots-v1"), apply: applyMajorCategoryEvidence},
		{version: "20260930_01_prompt_folder_archiving", checksum: label("AssetProductCategory.isArchived:v1"), apply: applyFolderArchiving},
		{version: "20260930_02_deconstruct_background_jobs", checksum: file("deconstruct_jobs.sql"), apply: script("deconstruct_jobs.sql", false)},
		{version: "20261001_01_workspace_full_prompt_numbers", checksum: label("workspace-full-prompt-library-numbers-v1"), apply: applyWorkspaceFullPromptNumbers},
		{version: "20261018_01_avatar_studio", checksum: file("avatar_studio.sql"), apply: script("avatar_studio.sql", false)},
		{version: "20261018_02_task_usage", checksum: file("task_usage.sql"), apply: script("task_usage.sql", true)},
		{version: "20261019_01_cover_memory", checksum: file("cover_memory.sql"), apply: script("cover_memory.sql", false)},
		{version: "20261022_01_skill_library", checksum: file("skill_library.sql"), apply: script("skill_library.sql", false)},
		{version: "20261022_02_category_skill_learning", checksum: file("category_skill_learning.sql"), apply: script("category_skill_learning.sql", false)},
		{version: "20261023_01_category_skill_memory", checksum: file("category_skill_memory.sql"), apply: script("category_skill_memory.sql", false)},
		{version: "20261023_02_workshop_repair", checksum: label("workshop-learning-and-shot-repair-v1"), apply: applyWorkshopRepair},
		{version: "20261023_03_reference_folder_repair", checksum: label("reference-primary-subject-folder-repair-v1"), apply: applyReferenceFolderRepair},
	}
}

func checksumAccepted(item migration, recorded string) bool {
	if item.checksum == recorded {
		return true
	}
	for _, compatible := range item.compatible {
		if compatible == recorded {
			return true
		}
	}
	return false
}

func pendingMigrations(applied map[string]string, items []migration) ([]migration, error) {
	for version, checksum := range applied {
		var match *migration
		for i := range items {
			if items[i].version == version {
				match = &items[i]
				break
			}
		}
		if match == nil || !checksumAccepted(*match, checksum) {
			return nil, fmt.Errorf("Database migration version mismatch: %s; use the matching application version", version)
		}
	}
	var pending []migration
	for _, item := range items {
		if _, ok := applied[item.version]; !ok {
			pending = append(pending, item)
		}
	}
	return pending, nil
}
