/**
 * 《常见失败模式》POC 检测：百科全书型、全能大杂烩型等。
 * 返回非空字符串时表示检测到疑似失败模式，建议优化（非阻断）。
 */

const GENERIC_PHRASES = ["任何", "全部", "各种", "通用场景", "所有场景", "任意", "一切", "万能"];

export function detectSkillFailurePattern(triggerCondition: string, steps: string): string | null {
  const trigger = (triggerCondition || "").trim();
  const stepsText = (steps || "").trim();
  for (const phrase of GENERIC_PHRASES) {
    if (trigger.includes(phrase) || stepsText.includes(phrase)) {
      return "该 Skill 表述较为通用，建议拆分为多个场景化 Skill。";
    }
  }
  const stepLines = stepsText.split(/\n/).filter((l) => l.trim().length > 0);
  if (stepLines.length <= 1 && stepsText.length < 50) {
    return "步骤描述过少或过短，建议补充具体可执行流程。";
  }
  return null;
}
