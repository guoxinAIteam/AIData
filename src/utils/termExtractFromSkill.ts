/**
 * 从 Skill 内容中提取候选术语（POC：关键词 + 简单规则）。
 * 用于外部 Skill 导入后自动生成待确认术语。
 */

export interface ExtractedTermCandidate {
  term: string;
  contextSnippet: string;
  suggestedDomain: string;
}

const DEFAULT_DOMAIN = "移动业务";

/** 移动业务相关关键词/短语（部分） */
const TERM_KEYWORDS = [
  "ARPU",
  "DOU",
  "MOU",
  "用户数",
  "活跃用户",
  "新增用户",
  "发展用户",
  "渗透率",
  "营收",
  "收入",
  "渠道",
  "公众渠道",
  "政企渠道",
  "副卡",
  "主卡",
  "5G",
  "4G",
  "套餐",
  "业务",
  "指标",
  "分省",
  "地市",
  "省份",
  "环比",
  "同比",
  "工单",
  "投诉",
  "办理",
  "账期",
  "月账期",
  "日账期",
];

/** 从文本中截取包含 term 的片段（前后各若干字） */
function snippetAround(text: string, term: string, maxLen = 80): string {
  const idx = text.indexOf(term);
  if (idx < 0) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + term.length + 60);
  let s = text.slice(start, end);
  if (s.length > maxLen) s = s.slice(0, maxLen - 3) + "...";
  return s;
}

/**
 * 从 Skill 名称、内容、摘要中提取候选术语。
 */
export function extractTermsFromSkillContent(
  name: string,
  content: string,
  summary: string,
): ExtractedTermCandidate[] {
  const seen = new Set<string>();
  const result: ExtractedTermCandidate[] = [];
  const fullText = [name, summary, content].filter(Boolean).join("\n");

  for (const kw of TERM_KEYWORDS) {
    if (!fullText.includes(kw)) continue;
    const normalized = kw.trim();
    if (normalized.length < 2 || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push({
      term: normalized,
      contextSnippet: snippetAround(fullText, normalized),
      suggestedDomain: DEFAULT_DOMAIN,
    });
  }

  return result;
}
