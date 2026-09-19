export function BrowserMigrationExport({
  showToast,
}: {
  showToast: (message: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
      <h4 className="font-bold text-sm text-slate-900">Web 迁移备份</h4>
      <p className="text-xs text-slate-500">
        导出当前设备的画布、会话与工坊草稿。数据库和原始素材需要单独备份。
      </p>
      <button
        type="button"
        className="px-3 py-2 rounded-lg bg-slate-100 text-sm text-slate-700"
        onClick={async () => {
          try {
            const { downloadBrowserArchive } = await import(
              "@/lib/exportBrowserArchive"
            );
            const warnings = await downloadBrowserArchive();
            showToast(
              warnings.length
                ? warnings.join("；")
                : "浏览器业务数据已导出；此备份不包含服务密钥。",
            );
          } catch (error) {
            showToast(
              `导出失败：${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }}
      >
        导出浏览器业务数据
      </button>
    </div>
  );
}
