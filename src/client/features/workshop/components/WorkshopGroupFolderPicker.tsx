/** Old folder IDs remain readable without reloading the reference library. */
export function WorkshopGroupFolderPicker({ folderId }: { folderId: string }) {
  return <p className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">历史参考文件夹：{folderId}</p>;
}
