import { parseWorkshopTable } from './workshopTableImport';

function decodeCsv(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('gb18030').decode(bytes); }
}

export async function readWorkshopTable(file: File, sheetName?: string) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('请选择 xlsx、xls 或 csv 表格');
  if (file.size > 10 * 1024 * 1024) throw new Error('表格超过 10 MB，请拆分后导入');
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read(decodeCsv(bytes), { type: 'string', raw: true, cellFormula: false, cellHTML: false })
    : XLSX.read(bytes, { type: 'array', cellFormula: false, cellHTML: false });
  const name = sheetName || workbook.SheetNames.find(candidate => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[candidate], { header: 1, range: 0, blankrows: false });
    return matrix.slice(0, 20).some(row => row.some(value => /^(商品id|商品链接|链接|sku)$/i.test(String(value ?? '').trim())));
  });
  if (!name || !workbook.Sheets[name]) throw new Error('没有找到商品任务工作表，请检查表头');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: true });
  if (matrix.length > 20001) throw new Error('单张表超过 20000 行，请拆分后导入');
  return { ...parseWorkshopTable(matrix), sheetName: name, sheetNames: workbook.SheetNames };
}
