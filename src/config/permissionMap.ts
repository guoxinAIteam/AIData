import type { AuthSession } from "../types/domain";

export type MenuPermissionCode =
  | "menu.workbench"
  | "menu.knowledgeSystem"
  | "menu.exampleQuestion"
  | "menu.glossary"
  | "menu.operationLog"
  | "menu.skillRanking"
  | "menu.metricQa"
  | "menu.ontologyModeling"
  | "menu.questionLabeling";

export interface MenuPermissionItem {
  key: string;
  route: string;
  label: string;
  permissionCode: MenuPermissionCode;
  /** 归属父级菜单 key，如 'app-scenario' 表示作为「应用场景」子项 */
  parentKey?: string;
}

/** 菜单分组定义 */
export const menuGroups = {
  knowledgeCenter: { key: "knowledge-center", label: "知识中心" },
  skillCenter: { key: "skill-center", label: "Skill 中心" },
  appScenario: { key: "app-scenario", label: "应用场景" },
} as const;

/** 向后兼容：旧代码引用 */
export const applicationScenarioMenuKey = menuGroups.appScenario.key;
export const applicationScenarioLabel = menuGroups.appScenario.label;

export const menuPermissionItems: MenuPermissionItem[] = [
  {
    key: "workbench",
    route: "/domain/workbench",
    label: "工作台",
    permissionCode: "menu.workbench",
  },
  {
    key: "knowledge-system",
    route: "/domain/knowledge-systems",
    label: "语义知识库",
    permissionCode: "menu.knowledgeSystem",
  },
  {
    key: "ontology-modeling",
    route: "/domain/ontology-modeling",
    label: "本体知识建模",
    permissionCode: "menu.ontologyModeling",
    parentKey: "knowledge-center",
  },
  {
    key: "glossary",
    route: "/domain/glossary",
    label: "业务术语词典",
    permissionCode: "menu.glossary",
    parentKey: "knowledge-center",
  },
  {
    key: "example-question",
    route: "/domain/example-questions",
    label: "示例问题库",
    permissionCode: "menu.exampleQuestion",
    parentKey: "knowledge-center",
  },
  {
    key: "skill-ranking",
    route: "/domain/skills",
    label: "Skill 库",
    permissionCode: "menu.skillRanking",
    parentKey: "skill-center",
  },
  {
    key: "metric-qa",
    route: "/domain/metric-qa",
    label: "智能指标问数",
    permissionCode: "menu.metricQa",
    parentKey: "app-scenario",
  },
  {
    key: "question-labeling",
    route: "/domain/question-labeling",
    label: "样本打标",
    permissionCode: "menu.questionLabeling",
    parentKey: "app-scenario",
  },
  {
    key: "operation-log",
    route: "/domain/operation-logs",
    label: "操作日志",
    permissionCode: "menu.operationLog",
  },
];

export const defaultPermissionCodes: MenuPermissionCode[] = menuPermissionItems.map(
  (item) => item.permissionCode,
);

const routePermissionRules: Array<{ match: RegExp; permissionCode: MenuPermissionCode }> = [
  { match: /^\/domain\/workbench/, permissionCode: "menu.workbench" },
  { match: /^\/domain\/knowledge-systems/, permissionCode: "menu.knowledgeSystem" },
  { match: /^\/domain\/example-questions/, permissionCode: "menu.exampleQuestion" },
  { match: /^\/domain\/glossary/, permissionCode: "menu.glossary" },
  { match: /^\/domain\/operation-logs/, permissionCode: "menu.operationLog" },
  { match: /^\/domain\/trace-center/, permissionCode: "menu.operationLog" },
  { match: /^\/domain\/skills/, permissionCode: "menu.skillRanking" },
  { match: /^\/domain\/metric-qa/, permissionCode: "menu.metricQa" },
  { match: /^\/domain\/ontology-modeling/, permissionCode: "menu.ontologyModeling" },
  { match: /^\/domain\/question-labeling/, permissionCode: "menu.questionLabeling" },
];

export function resolveMenuKeyByPath(pathname: string): string {
  const match = menuPermissionItems.find((item) => pathname.startsWith(item.route));
  if (match) {
    return match.route;
  }
  if (pathname.startsWith("/domain/trace-center")) {
    return "/domain/operation-logs";
  }
  return "/domain/workbench";
}

export function hasPermission(session: AuthSession | null, permissionCode: MenuPermissionCode): boolean {
  if (!session) {
    return false;
  }
  const permissionCodes = session.permissionCodes?.length
    ? session.permissionCodes
    : defaultPermissionCodes;
  return permissionCodes.includes(permissionCode);
}

export function hasRoutePermission(session: AuthSession | null, pathname: string): boolean {
  const rule = routePermissionRules.find((item) => item.match.test(pathname));
  if (!rule) {
    return true;
  }
  return hasPermission(session, rule.permissionCode);
}

export function getDefaultAuthorizedRoute(session: AuthSession | null): string {
  if (!session) {
    return "/login";
  }
  const first = menuPermissionItems.find((item) => hasPermission(session, item.permissionCode));
  return first?.route ?? "/domain/workbench";
}
