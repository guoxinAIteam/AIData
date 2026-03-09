/**
 * 样例问题打标：解析「参考问题分类表」与「样例问题清单」Excel。
 */
import * as XLSX from "xlsx";

export interface SampleRowInput {
  touchpoint: string;
  sessionTag: string;
  sessionSummary: string;
  knowledgeTitle: string;
  knowledgeAnswer: string;
  province: string;
}

/** 参考问题分类表：首个 Sheet，A 列（索引 0）去重非空 */
export function parseReferenceLabels(buffer: Buffer): string[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  const set = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const cell = rows[i][0];
    const s = typeof cell === "string" ? cell.trim() : cell != null ? String(cell).trim() : "";
    if (s) set.add(s);
  }
  return Array.from(set);
}

/** 样例问题清单：首个 Sheet，表头行 0，数据行从 1 开始；A=0, E=4, F=5, G=6, H=7, I=8 */
export function parseSampleRows(buffer: Buffer): SampleRowInput[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  const out: SampleRowInput[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const touchpoint = safeCell(row[0]);
    const sessionTag = safeCell(row[4]);
    const sessionSummary = safeCell(row[5]);
    const knowledgeTitle = safeCell(row[6]);
    const knowledgeAnswer = safeCell(row[7]);
    const province = safeCell(row[8]);
    out.push({
      touchpoint,
      sessionTag,
      sessionSummary,
      knowledgeTitle,
      knowledgeAnswer,
      province,
    });
  }
  return out;
}

function safeCell(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v.trim() : String(v).trim();
}

function displayLabel(row: { modelLabel: string; manualLabel?: string }): string {
  return (row.manualLabel ?? row.modelLabel) || "未分类";
}

/** 根据打标结果生成三 Sheet 工作簿（TOP聚类、触点维度TOP、省分维度TOP） */
export function buildExportWorkbook(rows: Array<{
  touchpoint: string;
  province: string;
  modelLabel: string;
  manualLabel?: string;
}>): XLSX.WorkBook {
  const getLabel = (r: { modelLabel: string; manualLabel?: string }) => displayLabel(r);
  const countByLabel = new Map<string, number>();
  const countByTouchpoint = new Map<string, Map<string, number>>();
  const countByProvince = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const label = getLabel(row);
    countByLabel.set(label, (countByLabel.get(label) ?? 0) + 1);
    if (!countByTouchpoint.has(row.touchpoint)) countByTouchpoint.set(row.touchpoint, new Map());
    const tpMap = countByTouchpoint.get(row.touchpoint)!;
    tpMap.set(label, (tpMap.get(label) ?? 0) + 1);
    if (!countByProvince.has(row.province)) countByProvince.set(row.province, new Map());
    const pvMap = countByProvince.get(row.province)!;
    pvMap.set(label, (pvMap.get(label) ?? 0) + 1);
  }
  const sheet1Data: unknown[][] = [["问题分类", "数量"]];
  const sorted1 = Array.from(countByLabel.entries()).sort((a, b) => b[1] - a[1]);
  sorted1.forEach(([label, count]) => sheet1Data.push([label, count]));
  const sheet2Data: unknown[][] = [["触点", "问题分类", "数量"]];
  for (const [touchpoint, map] of countByTouchpoint) {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([label, count]) => sheet2Data.push([touchpoint, label, count]));
  }
  const sheet3Data: unknown[][] = [["省分", "问题分类", "数量"]];
  for (const [province, map] of countByProvince) {
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([label, count]) => sheet3Data.push([province, label, count]));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet1Data), "TOP聚类问题排名");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet2Data), "触点维度TOP聚类问题排名");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet3Data), "省分维度TOP聚类问题排名");
  return wb;
}
