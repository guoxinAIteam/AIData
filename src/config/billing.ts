/**
 * 模型计费规则（元/1K tokens），可后续对齐厂商定价
 */
export const billingConfig = {
  kimi: {
    inputPer1k: 0.012,
    outputPer1k: 0.012,
  },
} as const;

export function computeKimiCost(promptTokens: number, completionTokens: number): number {
  const { inputPer1k, outputPer1k } = billingConfig.kimi;
  return Number(
    (inputPer1k * (promptTokens / 1000) + outputPer1k * (completionTokens / 1000)).toFixed(6),
  );
}
