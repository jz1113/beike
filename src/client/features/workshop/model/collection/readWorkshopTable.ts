import { parseWorkshopTable } from './workshopTableImport';

export async function readWorkshopTable(file: File, sheetName?: string) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('请选择 xlsx、xls 或 csv 表格');
  if (file.size > 10 * 1024 * 1024) throw new Error('表格超过 10 MB，请拆分后导入');
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
  const name = sheetName || workbook.SheetNames.find(candidate => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[candidate], { header: 1, range: 0, blankrows: false });
    return matrix.slice(0, 20).some(row => row.some(value => /^(商品id|商品链接|链接|sku)$/i.test(String(value ?? '').trim())));
  });
  if (!name || !workbook.Sheets[name]) throw new Error('没有找到商品任务工作表，请检查表头');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: true });
  if (matrix.length > 20001) throw new Error('单张表超过 20000 行，请拆分后导入');
  return { ...parseWorkshopTable(matrix), sheetName: name, sheetNames: workbook.SheetNames };
}
