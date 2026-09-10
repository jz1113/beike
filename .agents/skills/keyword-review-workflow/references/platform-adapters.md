# Platform adapters

## WorkBuddy

Use [../assets/workbuddy-prompt.md](../assets/workbuddy-prompt.md). Attach the source workbook in the same message when possible.

- Ask it to edit the attached workbook and return an `.xlsx`, not merely display a Markdown sample.
- Tell it to preserve the first nine columns exactly and append six columns.
- For large files, permit internal batch processing but require one consolidated workbook.
- If its spreadsheet editor cannot append columns directly, allow a new workbook containing all original data plus the six result columns.
- If it stops after previewing several rows, reply: `继续处理全部行，不要只给示例；完成后返回可下载的完整 Excel 文件。`

## 千问办公 / Qwen Office

Use [../assets/qwen-office-prompt.md](../assets/qwen-office-prompt.md). Upload the workbook through the office-file entry rather than pasting thousands of rows into chat.

- Select spreadsheet/Excel processing mode when available.
- Require a downloadable `.xlsx` result and prohibit Markdown-only output.
- Preserve source values and row order. A new result sheet is acceptable only if direct extension is unavailable; it must contain every original column and row.
- Large files may be evaluated in batches; the final workbook must be consolidated and complete.
- If the platform has a row limit, split by contiguous row ranges, merge in original order, and never deduplicate.

## Generic agents

Use [../assets/generic-agent-prompt.md](../assets/generic-agent-prompt.md).

If the agent cannot edit files, ask for UTF-8 CSV using the full 15-column schema. For large files, request numbered contiguous CSV parts plus a manifest recording each row range.

## Cross-platform acceptance test

The job is complete only when:

1. the delivered file contains the original row count plus one header row;
2. the first nine columns match the source values and order;
3. columns 10–15 use the required headers;
4. no review cell is missing;
5. output values follow the enumerations in `review-rules.md`;
6. the output file opens without repair warnings.
