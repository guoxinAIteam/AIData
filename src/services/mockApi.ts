import { defaultPermissionCodes } from "../config/permissionMap";
import { seededDomainData, seededUsers } from "../mocks/db";
import type {
  AuthSession,
  AuthUser,
  BusinessMetricQueryPayload,
  BusinessMetricQueryResult,
  BusinessMetricSnapshot,
  DataSourceConfig,
  DimensionItem,
  DimensionKnowledgeLink,
  DomainData,
  DatasetItem,
  DatasetDetailView,
  ExampleQuestion,
  GlossaryTerm,
  ImportedTable,
  KnowledgeCollection,
  KnowledgeSystemCard,
  KnowledgeSystemDetail,
  KnowledgeTable,
  MetricItem,
  MetricKnowledgeLink,
  MetricQAHistoryEntry,
  ModelUsageEntry,
  Nl2SemiticHit,
  OntologyConcept,
  OntologyLibrary,
  OntologyMapping,
  OntologyRelation,
  OntologyRelationType,
  OperationLogEntry,
  OperationLogModule,
  PermissionCategory,
  PermissionRecord,
  PermissionResource,
  QaSkillBindRecord,
  ReadOnlyQueryResult,
  SkillFilter,
  SkillKnowledgeEntry,
  SkillLeaderboardMode,
  SkillItem,
  TraceRecord,
  TreeNode,
  UploadedDocumentItem,
  UploadRecord,
  QuestionLabelingJob,
} from "../types/domain";
import type { PendingGlossaryTerm } from "../types/domain";
import { getSkillSourceType } from "../types/domain";
import { extractTermsFromSkillContent } from "../utils/termExtractFromSkill";

const AUTH_USERS_KEY = "zy_auth_users";
const AUTH_SESSION_KEY = "zy_auth_session";
const DOMAIN_DATA_KEY = "zy_domain_data";
const SKILLS_PROXY_SYNC_ENDPOINT = "/api/skills/sync";
const SKILLS_PROXY_DETAIL_ENDPOINT = "/api/skills/detail";

const delay = async (ms = 280) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const nowText = () => {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
};

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);

interface SkillProxyListItem {
  id: string;
  rank: number;
  name: string;
  owner: string;
  repository: string;
  skill: string;
  detailUrl: string;
  installsText: string;
  installsCount: number;
}

interface SkillProxyListResponse {
  success: boolean;
  fetchedAt?: string;
  lastSyncAt?: string;
  items?: SkillProxyListItem[];
  error?: string;
}

interface SkillProxyDetailItem {
  owner: string;
  repository: string;
  skill: string;
  detailUrl: string;
  summary: string;
  content: string;
  tags: string[];
  applicableScenes: string[];
}

interface SkillProxyDetailResponse {
  success: boolean;
  item?: SkillProxyDetailItem;
  error?: string;
}

const seedOfficialSkills = seededDomainData.skillItems.filter((item) => !item.isCustom);

const normalizeSkillIdSegment = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const makeOfficialSkillId = (owner: string, repository: string, skillSlug: string) =>
  `skill-official-${normalizeSkillIdSegment(owner)}-${normalizeSkillIdSegment(repository)}-${normalizeSkillIdSegment(
    skillSlug,
  )}`;

const inferSkillCategory = (name: string, repository: string): SkillItem["category"] => {
  const text = `${name}|${repository}`.toLowerCase();
  if (
    text.includes("sql") ||
    text.includes("analytics") ||
    text.includes("data") ||
    text.includes("metric") ||
    text.includes("analysis")
  ) {
    return "数据分析";
  }
  if (text.includes("agent") || text.includes("workflow") || text.includes("automation")) {
    return "Agent 编排";
  }
  if (text.includes("frontend") || text.includes("react") || text.includes("next") || text.includes("dev")) {
    return "开发提效";
  }
  return "官方推荐";
};

const normalizeSkillItem = (item: SkillItem): SkillItem => {
  if (item.isCustom) {
    return {
      ...item,
      source: "user",
      category: item.category ?? "用户创建",
      tags: item.tags ?? [],
      applicableScenes: item.applicableScenes ?? [],
      createdByUserId: item.createdByUserId,
      isOfficial: false,
      version: item.version ?? "1.0",
      importSource: item.importSource ?? "manual",
    };
  }
  return {
    ...item,
    source: "www.skills.sh",
    category: item.category ?? inferSkillCategory(item.name, item.repository ?? ""),
    tags: item.tags ?? [],
    applicableScenes: item.applicableScenes ?? [],
    isOfficial: item.isOfficial ?? true,
    version: item.version ?? "1.0",
  };
};

const dedupeSkillItems = (skills: SkillItem[]): SkillItem[] => {
  const customSeen = new Set<string>();
  const officialSeen = new Set<string>();
  const deduped: SkillItem[] = [];
  skills.forEach((raw) => {
    const item = normalizeSkillItem(raw);
    const customKey = item.isCustom ? item.id : "";
    const officialKey = item.isCustom
      ? ""
      : `${item.owner ?? ""}|${item.repository ?? ""}|${item.skillSlug ?? ""}|${item.name}`;
    if (item.isCustom) {
      if (customSeen.has(customKey)) {
        return;
      }
      customSeen.add(customKey);
      deduped.push(item);
      return;
    }
    if (officialSeen.has(officialKey)) {
      return;
    }
    officialSeen.add(officialKey);
    deduped.push(item);
  });
  return deduped;
};

const toSkillList = (
  officialSkills: SkillItem[],
  customSkills: SkillItem[],
  filter: SkillFilter,
): SkillItem[] => {
  const mode = filter.mode ?? "all";
  const keyword = filter.keyword?.trim().toLowerCase();
  const merged = dedupeSkillItems([...customSkills, ...officialSkills]);
  return merged
    .filter((item) => {
      const keywordMatched = keyword
        ? [
            item.name,
            item.summary,
            item.tags.join(","),
            item.applicableScenes.join(","),
            item.repository ?? "",
            item.owner ?? "",
          ]
            .join("|")
            .toLowerCase()
            .includes(keyword)
        : true;
      const categoryMatched = filter.category && filter.category !== "all" ? item.category === filter.category : true;
      const statusMatched = filter.status && filter.status !== "all" ? item.status === filter.status : true;
      const sourceTypeMatched =
        filter.sourceType && filter.sourceType !== "all"
          ? getSkillSourceType(item) === filter.sourceType
          : true;
      const createdByMatched =
        filter.createdByUserId != null && filter.createdByUserId !== ""
          ? item.isCustom && item.createdByUserId === filter.createdByUserId
          : true;
      return keywordMatched && categoryMatched && statusMatched && sourceTypeMatched && createdByMatched;
    })
    .sort((a, b) => {
      if (mode === "hot") {
        const installDiff = (b.installsCount ?? 0) - (a.installsCount ?? 0);
        if (installDiff !== 0) {
          return installDiff;
        }
      }
      if (mode === "trending") {
        if (a.updatedAt !== b.updatedAt) {
          return a.updatedAt < b.updatedAt ? 1 : -1;
        }
      }
      if (!a.isCustom && !b.isCustom && a.rank && b.rank) {
        return a.rank - b.rank;
      }
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
};

const toOfficialSkill = (proxyItem: SkillProxyListItem): SkillItem => {
  const tags = dedupeSkillItems([
    {
      id: "tmp",
      name: proxyItem.name,
      summary: "",
      category: "官方推荐",
      tags: proxyItem.skill.split("-").filter(Boolean).slice(0, 4),
      applicableScenes: [],
      content: "",
      source: "www.skills.sh",
      author: "skills.sh",
      updatedAt: nowText(),
      status: "enabled",
      isCustom: false,
    },
  ])[0].tags;
  return {
    id: proxyItem.id || makeOfficialSkillId(proxyItem.owner, proxyItem.repository, proxyItem.skill),
    rank: proxyItem.rank,
    name: proxyItem.name,
    summary: `来自 skills.sh 的热门 Skill：${proxyItem.name}`,
    category: inferSkillCategory(proxyItem.name, proxyItem.repository),
    tags,
    applicableScenes: ["技能发现", "能力扩展", "工作流复用"],
    content: `该 Skill 来源于 skills.sh 榜单。可点击“查看”获取完整内容。\n\n仓库：${proxyItem.owner}/${proxyItem.repository}`,
    source: "www.skills.sh",
    sourceUrl: proxyItem.detailUrl,
    owner: proxyItem.owner,
    repository: proxyItem.repository,
    skillSlug: proxyItem.skill,
    installsText: proxyItem.installsText,
    installsCount: proxyItem.installsCount,
    author: "skills.sh",
    updatedAt: nowText(),
    status: "enabled",
    isCustom: false,
    isOfficial: true,
    version: "1.0",
    crawlChannel: "skills.sh",
    crawledAt: nowText(),
  };
};

const loadSkillBuckets = (data: DomainData) => {
  const customSkills = data.skillItems.filter((item) => item.isCustom).map((item) => normalizeSkillItem(item));
  const officialSkillsFromStorage = data.skillItems
    .filter((item) => !item.isCustom)
    .map((item) => normalizeSkillItem(item));
  const officialSkills =
    officialSkillsFromStorage.length > 0
      ? officialSkillsFromStorage
      : seedOfficialSkills.map((item) => normalizeSkillItem(item));
  return {
    customSkills,
    officialSkills,
  };
};

const saveMergedSkillItems = (
  data: DomainData,
  customSkills: SkillItem[],
  officialSkills: SkillItem[],
  lastSyncAt: string,
) => {
  const merged = dedupeSkillItems([...customSkills, ...officialSkills]);
  saveDomainData({
    ...data,
    skillItems: merged,
    lastSkillSyncAt: lastSyncAt,
  });
  return merged;
};

const extractErrorMessage = (unknownError: unknown) => {
  if (unknownError instanceof Error) {
    return unknownError.message;
  }
  return "未知错误";
};

const fetchSkillProxyList = async (
  endpoint: string,
  method: "GET" | "POST" = "GET",
): Promise<{ items: SkillItem[]; syncAt: string }> => {
  if (typeof fetch === "undefined") {
    return {
      items: seedOfficialSkills.map((item) => normalizeSkillItem(item)),
      syncAt: nowText(),
    };
  }
  const response = await fetch(endpoint, { method });
  if (!response.ok) {
    throw new Error(`技能代理接口异常：${response.status}`);
  }
  const payload = (await response.json()) as SkillProxyListResponse;
  if (!payload.success) {
    throw new Error(payload.error || "技能代理接口返回失败");
  }
  const items = (payload.items ?? []).map((item) => toOfficialSkill(item));
  if (items.length === 0) {
    throw new Error("技能代理返回为空");
  }
  return {
    items,
    syncAt: payload.lastSyncAt || payload.fetchedAt || nowText(),
  };
};

const fetchSkillProxyDetail = async (skill: SkillItem): Promise<SkillItem | null> => {
  if (typeof fetch === "undefined" || skill.isCustom || !skill.owner || !skill.repository || !skill.skillSlug) {
    return null;
  }
  const params = new URLSearchParams({
    owner: skill.owner,
    repo: skill.repository,
    skill: skill.skillSlug,
  });
  const response = await fetch(`${SKILLS_PROXY_DETAIL_ENDPOINT}?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Skill 详情加载失败：${response.status}`);
  }
  const payload = (await response.json()) as SkillProxyDetailResponse;
  if (!payload.success || !payload.item) {
    throw new Error(payload.error || "Skill 详情接口无返回");
  }
  return {
    ...skill,
    summary: payload.item.summary || skill.summary,
    content: payload.item.content || skill.content,
    tags: payload.item.tags?.length ? payload.item.tags : skill.tags,
    applicableScenes: payload.item.applicableScenes?.length
      ? payload.item.applicableScenes
      : skill.applicableScenes,
    sourceUrl: payload.item.detailUrl || skill.sourceUrl,
    updatedAt: nowText(),
  };
};

const normalizeUser = (user: Partial<AuthUser>): AuthUser => ({
  id: user.id ?? createId("u"),
  username: user.username ?? "user",
  password: user.password ?? "123456",
  displayName: user.displayName ?? user.username ?? "用户",
  avatarColor: user.avatarColor ?? "#1677ff",
  permissionCodes: [...new Set([...defaultPermissionCodes, ...(Array.isArray(user.permissionCodes) ? user.permissionCodes : [])])],
});

const toSession = (user: AuthUser): AuthSession => ({
  userId: user.id,
  username: user.username,
  displayName: user.displayName,
  permissionCodes: [...new Set([...defaultPermissionCodes, ...(Array.isArray(user.permissionCodes) ? user.permissionCodes : [])])],
});

/**
 * Merge seed items into existing array by ID, preserving user-created items
 * while ensuring new seed entries are always present.
 */
const mergeSeedById = <T extends { id: string }>(existing: T[] | undefined, seed: T[]): T[] => {
  const base = existing ?? seed;
  const existingIds = new Set(base.map((item) => item.id));
  const missing = seed.filter((item) => !existingIds.has(item.id));
  return missing.length > 0 ? [...base, ...missing] : base;
};

const normalizeDomainData = (raw: Partial<DomainData>): DomainData => {
  const mergedKnowledgeDetails = { ...(seededDomainData.knowledgeDetails ?? {}), ...(raw.knowledgeDetails ?? {}) };

  return {
    ...seededDomainData,
    ...raw,
    knowledgeSystems: mergeSeedById(raw.knowledgeSystems, seededDomainData.knowledgeSystems),
    knowledgeDetails: mergedKnowledgeDetails,
    glossaryTerms: raw.glossaryTerms ?? seededDomainData.glossaryTerms,
    pendingGlossaryTerms: raw.pendingGlossaryTerms ?? seededDomainData.pendingGlossaryTerms,
    exampleQuestions: raw.exampleQuestions ?? seededDomainData.exampleQuestions,
    traceStats: raw.traceStats ?? seededDomainData.traceStats,
    traceTrend: raw.traceTrend ?? seededDomainData.traceTrend,
    traceRecords: raw.traceRecords ?? seededDomainData.traceRecords,
    skillItems: dedupeSkillItems(
      mergeSeedById(raw.skillItems, seededDomainData.skillItems).map((item) => normalizeSkillItem(item)),
    ),
    lastSkillSyncAt: raw.lastSkillSyncAt ?? seededDomainData.lastSkillSyncAt,
    businessMetrics: raw.businessMetrics ?? seededDomainData.businessMetrics,
    metricKnowledgeLinks: raw.metricKnowledgeLinks ?? seededDomainData.metricKnowledgeLinks,
    dimensionKnowledgeLinks: raw.dimensionKnowledgeLinks ?? seededDomainData.dimensionKnowledgeLinks,
    pendingMetricSync: raw.pendingMetricSync ?? seededDomainData.pendingMetricSync,
    pendingDimensionSync: raw.pendingDimensionSync ?? seededDomainData.pendingDimensionSync,
    importedTables: raw.importedTables ?? seededDomainData.importedTables,
    termKnowledgeLinks: raw.termKnowledgeLinks ?? seededDomainData.termKnowledgeLinks,
    qaSkillBindRecords: raw.qaSkillBindRecords ?? seededDomainData.qaSkillBindRecords ?? [],
    ontologyLibraries: raw.ontologyLibraries ?? seededDomainData.ontologyLibraries ?? [],
    ontologyConcepts: raw.ontologyConcepts ?? seededDomainData.ontologyConcepts ?? [],
    ontologyProperties: raw.ontologyProperties ?? seededDomainData.ontologyProperties ?? [],
    ontologyRelationTypes: raw.ontologyRelationTypes ?? seededDomainData.ontologyRelationTypes ?? [],
    ontologyRelations: raw.ontologyRelations ?? seededDomainData.ontologyRelations ?? [],
    ontologyMappings: raw.ontologyMappings ?? seededDomainData.ontologyMappings ?? [],
    operationLogs: raw.operationLogs ?? seededDomainData.operationLogs ?? [],
    modelUsageRecords: raw.modelUsageRecords ?? seededDomainData.modelUsageRecords ?? [],
    metricQAHistory: raw.metricQAHistory ?? seededDomainData.metricQAHistory ?? [],
    skillKnowledgeEntries: mergeSeedById(raw.skillKnowledgeEntries, seededDomainData.skillKnowledgeEntries ?? []),
    questionLabelingJobs: raw.questionLabelingJobs ?? seededDomainData.questionLabelingJobs ?? [],
  };
};

const loadUsers = (): AuthUser[] => {
  if (!canUseStorage()) {
    return deepClone(seededUsers).map((item) => normalizeUser(item));
  }
  const raw = window.localStorage.getItem(AUTH_USERS_KEY);
  if (!raw) {
    window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(seededUsers));
    return deepClone(seededUsers).map((item) => normalizeUser(item));
  }
  const parsed = JSON.parse(raw) as Partial<AuthUser>[];
  const normalized = parsed.map((item) => normalizeUser(item));
  window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(normalized));
  return normalized;
};

const saveUsers = (users: AuthUser[]) => {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
};

const loadDomainData = (): DomainData => {
  if (!canUseStorage()) {
    return normalizeDomainData(deepClone(seededDomainData));
  }
  const raw = window.localStorage.getItem(DOMAIN_DATA_KEY);
  if (!raw) {
    window.localStorage.setItem(DOMAIN_DATA_KEY, JSON.stringify(seededDomainData));
    return normalizeDomainData(deepClone(seededDomainData));
  }
  const normalized = normalizeDomainData(JSON.parse(raw) as Partial<DomainData>);
  window.localStorage.setItem(DOMAIN_DATA_KEY, JSON.stringify(normalized));
  return normalized;
};

const saveDomainData = (data: DomainData) => {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(DOMAIN_DATA_KEY, JSON.stringify(data));
};

const loadSession = (): AuthSession | null => {
  if (!canUseStorage()) {
    return null;
  }
  const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    const fromStorage = Array.isArray(parsed.permissionCodes) ? parsed.permissionCodes : [];
    return {
      userId: parsed.userId ?? "",
      username: parsed.username ?? "",
      displayName: parsed.displayName ?? parsed.username ?? "用户",
      permissionCodes: [...new Set([...defaultPermissionCodes, ...fromStorage])],
    };
  } catch {
    return null;
  }
};

const saveSession = (session: AuthSession | null) => {
  if (!canUseStorage()) {
    return;
  }
  if (!session) {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
};

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  password: string;
  confirmPassword: string;
}

export interface GlossaryFilter {
  knowledgeSystemId?: string;
  termType?: GlossaryTerm["termType"];
  keyword?: string;
}

export interface ExampleQuestionFilter {
  keyword?: string;
}

export interface TraceFilter {
  keyword?: string;
  status?: TraceRecord["status"] | "全部";
  model?: string | "全部";
}

/** 操作日志筛选 */
export interface OperationLogFilter {
  modules?: OperationLogModule[];
  timeRange?: "today" | "yesterday" | "7d" | "30d" | "custom";
  startDate?: string;
  endDate?: string;
  operator?: string;
  keyword?: string;
  /** 按操作记录 ID 精确筛选（用于从模型用量跳转定位） */
  operationLogId?: string;
  /** 经营指标问数结果来源：大模型 / 本地样例 */
  resultSource?: "大模型" | "本地样例";
  page?: number;
  pageSize?: number;
}

/** 模型用量统计筛选 */
export interface ModelUsageFilter {
  timeRange?: "today" | "yesterday" | "7d" | "30d" | "custom";
  startDate?: string;
  endDate?: string;
  operatorId?: string;
  module?: OperationLogModule;
  page?: number;
  pageSize?: number;
}

export interface PermissionCreatePayload {
  category: PermissionCategory;
  subjectType: PermissionRecord["subjectType"];
  subjectName: string;
  selectedResourceKeys: string[];
  systemId: string;
}

export const authApi = {
  getSessionSync: (): AuthSession | null => loadSession(),

  async login(payload: LoginPayload): Promise<AuthSession> {
    await delay();
    const users = loadUsers();
    const found = users.find(
      (item) => item.username === payload.username && item.password === payload.password,
    );
    if (!found) {
      throw new Error("用户名或密码错误");
    }

    const session = toSession(found);
    saveSession(session);
    return session;
  },

  async register(payload: RegisterPayload): Promise<AuthSession> {
    await delay();
    if (payload.password !== payload.confirmPassword) {
      throw new Error("两次输入的密码不一致");
    }

    const users = loadUsers();
    const exists = users.some((item) => item.username === payload.username);
    if (exists) {
      throw new Error("用户名已存在");
    }

    const displayName = payload.username.length >= 2 ? payload.username : `${payload.username}用户`;
    const user: AuthUser = {
      id: createId("u"),
      username: payload.username,
      password: payload.password,
      displayName,
      avatarColor: "#1677ff",
      permissionCodes: defaultPermissionCodes,
    };
    const nextUsers = [...users, user];
    saveUsers(nextUsers);

    const session = toSession(user);
    saveSession(session);
    return session;
  },

  async logout(): Promise<void> {
    await delay(120);
    saveSession(null);
  },
};

export const domainApi = {
  async getKnowledgeSystems(keyword?: string): Promise<KnowledgeSystemCard[]> {
    await delay();
    const data = loadDomainData();
    if (!keyword?.trim()) {
      return data.knowledgeSystems;
    }
    const query = keyword.trim().toLowerCase();
    return data.knowledgeSystems.filter((item) => item.name.toLowerCase().includes(query));
  },

  /** 根据知识库 systemId 解析出对应 Skill 的创建者 userId，用于权限校验 */
  getKnowledgeSystemCreatorUserId(systemId: string): string | undefined {
    const data = loadDomainData();
    const card = data.knowledgeSystems.find((k) => k.id === systemId);
    if (!card?.skillId) return undefined;
    const skill = data.skillItems.find((s) => s.id === card.skillId);
    return skill?.createdByUserId;
  },

  /** 校验当前用户为知识库对应 Skill 的创建者，否则抛错 */
  ensureKnowledgeSystemCreator(systemId: string, currentUserId?: string): void {
    const creatorId = this.getKnowledgeSystemCreatorUserId(systemId);
    if (creatorId != null && currentUserId != null && creatorId !== currentUserId) {
      throw new Error("无权限：仅该知识库对应 Skill 的创建者可操作");
    }
  },

  async createKnowledgeSystem(
    skillId: string,
    name?: string,
    description?: string,
    currentUserId?: string,
  ): Promise<KnowledgeSystemCard[]> {
    await delay();
    const data = loadDomainData();
    const skill = data.skillItems.find((s) => s.id === skillId);
    if (!skill) {
      throw new Error("Skill 不存在");
    }
    if (skill.createdByUserId != null && currentUserId != null && skill.createdByUserId !== currentUserId) {
      throw new Error("无权限：仅该 Skill 的创建者可为其创建语义知识库");
    }
    const existing = data.knowledgeSystems.find((k) => k.skillId === skillId);
    if (existing) {
      return data.knowledgeSystems;
    }
    const templateDetail = data.knowledgeDetails["ks-001"] ?? Object.values(data.knowledgeDetails)[0];
    const next: KnowledgeSystemCard = {
      id: createId("ks"),
      skillId,
      name: name ?? skill.name,
      description: description ?? skill.summary ?? "",
      datasetCount: templateDetail?.datasets?.length ?? 0,
      metricCount: templateDetail?.metrics?.length ?? 0,
      owner: skill.author ?? "—",
      updatedAt: nowText(),
    };
    const nextDetail = templateDetail
      ? { ...templateDetail, systemId: next.id, skillId }
      : ({
          systemId: next.id,
          skillId,
          dataSource: {} as DataSourceConfig,
          datasetTree: [],
          datasets: [],
          metricTree: [],
          metrics: [],
          dimensionTree: [],
          dimensions: [],
          permissions: {} as KnowledgeSystemDetail["permissions"],
          permissionResources: {} as KnowledgeSystemDetail["permissionResources"],
        } as KnowledgeSystemDetail);
    const nextData = {
      ...data,
      knowledgeSystems: [next, ...data.knowledgeSystems],
      knowledgeDetails: {
        ...data.knowledgeDetails,
        [next.id]: nextDetail,
      },
    };
    saveDomainData(nextData);
    return nextData.knowledgeSystems;
  },

  async removeKnowledgeSystem(id: string, currentUserId?: string): Promise<KnowledgeSystemCard[]> {
    await delay();
    const data = loadDomainData();
    const creatorId = this.getKnowledgeSystemCreatorUserId(id);
    if (creatorId != null && currentUserId != null && creatorId !== currentUserId) {
      throw new Error("无权限：仅该知识库对应 Skill 的创建者可删除");
    }
    const knowledgeSystems = data.knowledgeSystems.filter((item) => item.id !== id);
    const knowledgeDetails = { ...data.knowledgeDetails };
    delete knowledgeDetails[id];
    const nextData = { ...data, knowledgeSystems, knowledgeDetails };
    saveDomainData(nextData);
    return nextData.knowledgeSystems;
  },

  async getKnowledgeDetail(systemId: string) {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId] ?? data.knowledgeDetails["ks-001"];
    const card = data.knowledgeSystems.find((k) => k.id === systemId);
    const skillId = (detail as KnowledgeSystemDetail & { skillId?: string }).skillId ?? card?.skillId;
    const creatorUserId = this.getKnowledgeSystemCreatorUserId(systemId);
    const importedTables = (data.importedTables ?? []).filter((t) => t.knowledgeSystemId === systemId);
    return {
      ...detail,
      systemId: detail.systemId,
      skillId,
      creatorUserId,
      importedTables,
    } as KnowledgeSystemDetail & { creatorUserId?: string; importedTables: ImportedTable[] };
  },

  async updateKnowledgeDataSource(
    systemId: string,
    config: DataSourceConfig,
    currentUserId?: string,
  ): Promise<DataSourceConfig> {
    await delay();
    const data = loadDomainData();
    const creatorId = this.getKnowledgeSystemCreatorUserId(systemId);
    if (creatorId != null && currentUserId != null && creatorId !== currentUserId) {
      throw new Error("无权限：仅该知识库对应 Skill 的创建者可编辑数据源");
    }
    const detail = data.knowledgeDetails[systemId];
    if (!detail) {
      throw new Error("知识库不存在");
    }
    const nextDetail = { ...detail, dataSource: { ...config } };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDetail.dataSource;
  },

  async uploadDataSourceDocuments(
    systemId: string,
    items: UploadedDocumentItem[],
    currentUserId?: string,
  ): Promise<UploadedDocumentItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const dataSource = detail.dataSource ?? ({} as DataSourceConfig);
    const existing = dataSource.uploadedDocuments ?? [];
    const nextDocs = [...existing, ...items];
    const session = authApi.getSessionSync();
    const uploaderName = session?.displayName ?? session?.username ?? "—";
    const uploadRecords: UploadRecord[] = detail.uploadRecords ?? [];
    const newRecords: UploadRecord[] = items.map((doc) => ({
      id: createId("ur"),
      name: doc.name,
      type: "document" as const,
      uploadedAt: doc.uploadedAt,
      uploaderId: doc.uploaderId ?? currentUserId,
      uploaderName,
      dataSourceId: systemId,
      skillId: detail.skillId,
      documentRef: doc.id,
    }));
    const nextDetail = {
      ...detail,
      dataSource: { ...dataSource, sourceType: dataSource.sourceType ?? "DOCUMENT_UPLOAD", uploadedDocuments: nextDocs },
      uploadRecords: [...uploadRecords, ...newRecords],
    };
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return nextDocs;
  },

  async removeDataSourceDocument(
    systemId: string,
    documentId: string,
    currentUserId?: string,
  ): Promise<UploadedDocumentItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const dataSource = detail.dataSource ?? ({} as DataSourceConfig);
    const nextDocs = (dataSource.uploadedDocuments ?? []).filter((d) => d.id !== documentId);
    const nextDetail = {
      ...detail,
      dataSource: { ...dataSource, uploadedDocuments: nextDocs },
    };
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return nextDocs;
  },

  async removeUploadRecord(systemId: string, recordId: string, currentUserId?: string): Promise<UploadRecord[]> {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const records = detail.uploadRecords ?? [];
    const record = records.find((r) => r.id === recordId);
    if (record?.uploaderId != null && currentUserId != null && record.uploaderId !== currentUserId) {
      throw new Error("无权限：仅上传者可删除该记录");
    }
    const nextRecords = records.filter((r) => r.id !== recordId);
    const nextDetail = { ...detail, uploadRecords: nextRecords };
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return nextRecords;
  },

  async updateKnowledgeCollection(
    systemId: string,
    payload: Partial<KnowledgeCollection>,
    currentUserId?: string,
  ): Promise<KnowledgeCollection> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const now = nowText();
    const prev = detail.knowledgeCollection ?? { tables: [] };
    const nextCollection: KnowledgeCollection = {
      ...prev,
      ...payload,
      tables: payload.tables ?? prev.tables,
      updatedAt: now,
    };
    const nextDetail = { ...detail, knowledgeCollection: nextCollection };
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return nextCollection;
  },

  async uploadTableStructure(
    systemId: string,
    payload: { name: string; tableName: string; fields: { name: string; type?: string; comment?: string }[]; relations?: string[] },
    currentUserId?: string,
  ): Promise<UploadRecord> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const session = authApi.getSessionSync();
    const uploaderName = session?.displayName ?? session?.username ?? "—";
    const now = nowText();
    const record: UploadRecord = {
      id: createId("ur"),
      name: payload.name,
      type: "table_structure",
      uploadedAt: now,
      uploaderId: currentUserId,
      uploaderName,
      dataSourceId: systemId,
      skillId: detail.skillId,
      tableStructure: { fields: payload.fields, relations: payload.relations },
    };
    const nextRecords = [...(detail.uploadRecords ?? []), record];
    const newTable: KnowledgeTable = {
      tableName: payload.tableName,
      fields: payload.fields,
      relations: payload.relations,
    };
    const prevCollection = detail.knowledgeCollection ?? { tables: [] };
    const nextCollection: KnowledgeCollection = {
      ...prevCollection,
      tables: [...prevCollection.tables, newTable],
      updatedAt: now,
    };
    const nextDetail = {
      ...detail,
      uploadRecords: nextRecords,
      knowledgeCollection: nextCollection,
    };
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return record;
  },

  async syncKnowledgeFromParsedExcel(
    systemId: string,
    payload: {
      knowledgeCollection?: KnowledgeCollection;
      metrics?: Array<Omit<MetricItem, "id">>;
      dimensions?: Array<Omit<DimensionItem, "id">>;
    },
    currentUserId?: string,
  ): Promise<{ knowledgeCollection?: KnowledgeCollection; metrics: MetricItem[]; dimensions: DimensionItem[] }> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    let nextDetail = { ...detail };
    if (payload.knowledgeCollection) {
      nextDetail = {
        ...nextDetail,
        knowledgeCollection: { ...payload.knowledgeCollection, updatedAt: nowText() },
      };
    }
    if (payload.metrics && payload.metrics.length > 0) {
      const newMetrics: MetricItem[] = payload.metrics.map((m) => ({
        id: createId("mt"),
        name: m.name ?? "未命名指标",
        metricType: m.metricType ?? "基础指标",
        definition: m.definition ?? "",
        code: m.code ?? (m.name?.replace(/\s+/g, "_") ?? "code"),
        source: "skill_excel" as const,
      }));
      nextDetail = {
        ...nextDetail,
        metrics: [...(nextDetail.metrics ?? []), ...newMetrics],
      };
    }
    if (payload.dimensions && payload.dimensions.length > 0) {
      const newDimensions: DimensionItem[] = payload.dimensions.map((d) => ({
        id: createId("dim"),
        name: d.name ?? "未命名维度",
        code: d.code ?? (d.name?.replace(/\s+/g, "_") ?? "code"),
        parentName: d.parentName ?? "-",
        valueConstraint: d.valueConstraint ?? "",
        source: "skill_excel" as const,
      }));
      nextDetail = {
        ...nextDetail,
        dimensions: [...(nextDetail.dimensions ?? []), ...newDimensions],
      };
    }
    saveDomainData({
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    });
    return {
      knowledgeCollection: nextDetail.knowledgeCollection,
      metrics: nextDetail.metrics ?? [],
      dimensions: nextDetail.dimensions ?? [],
    };
  },

  async extractMetricsDimensions(
    systemId: string,
    payload: { content: string },
    currentUserId?: string,
  ): Promise<{ metrics: MetricItem[]; dimensions: DimensionItem[] }> {
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const res = await fetch(`/api/knowledge/${encodeURIComponent(systemId)}/extract-metrics-dimensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: payload.content }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.detail || data.error || "抽取失败");
    }
    const data2 = loadDomainData();
    const detail = data2.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const newMetrics: MetricItem[] = (data.metrics ?? []).map((m: { name?: string; metricType?: string; definition?: string; code?: string }) => ({
      id: createId("mt"),
      name: m.name ?? "未命名指标",
      metricType: (m.metricType === "复合指标" ? "复合指标" : "基础指标") as MetricItem["metricType"],
      definition: m.definition ?? "",
      code: m.code ?? m.name?.replace(/\s+/g, "_") ?? "code",
      source: "document_extract",
    }));
    const newDimensions: DimensionItem[] = (data.dimensions ?? []).map((d: { name?: string; code?: string; parentName?: string; valueConstraint?: string }) => ({
      id: createId("dim"),
      name: d.name ?? "未命名维度",
      code: d.code ?? d.name?.replace(/\s+/g, "_") ?? "code",
      parentName: d.parentName ?? "-",
      valueConstraint: d.valueConstraint ?? "",
      source: "document_extract",
    }));
    const nextMetrics = [...(detail.metrics ?? []), ...newMetrics];
    const nextDimensions = [...(detail.dimensions ?? []), ...newDimensions];
    const nextDetail = { ...detail, metrics: nextMetrics, dimensions: nextDimensions };
    saveDomainData({
      ...data2,
      knowledgeDetails: { ...data2.knowledgeDetails, [systemId]: nextDetail },
    });
    return { metrics: nextMetrics, dimensions: nextDimensions };
  },

  async createPermissionRecord(payload: PermissionCreatePayload, currentUserId?: string): Promise<PermissionRecord[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(payload.systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[payload.systemId];
    if (!detail) {
      throw new Error("知识库不存在");
    }
    const resources = detail.permissionResources[payload.category];
    const selectedItems = resources.filter((item) => payload.selectedResourceKeys.includes(item.key));
    const desc = `已授权 ${selectedItems.map((item) => item.name).join("、") || "无资源"}`;
    const record: PermissionRecord = {
      id: createId("pr"),
      subjectType: payload.subjectType,
      subjectName: payload.subjectName,
      permissionDesc: desc,
      updatedBy: "赵金慧",
      updatedAt: nowText(),
      enabled: true,
    };
    const nextDetail = {
      ...detail,
      permissions: {
        ...detail.permissions,
        [payload.category]: [record, ...detail.permissions[payload.category]],
      },
    };
    const nextData = {
      ...data,
      knowledgeDetails: {
        ...data.knowledgeDetails,
        [payload.systemId]: nextDetail,
      },
    };
    saveDomainData(nextData);
    return nextDetail.permissions[payload.category];
  },

  async removePermissionRecord(
    systemId: string,
    category: PermissionCategory,
    recordId: string,
    currentUserId?: string,
  ): Promise<PermissionRecord[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) {
      return [];
    }
    const nextList = detail.permissions[category].filter((item) => item.id !== recordId);
    const nextData = {
      ...data,
      knowledgeDetails: {
        ...data.knowledgeDetails,
        [systemId]: {
          ...detail,
          permissions: {
            ...detail.permissions,
            [category]: nextList,
          },
        },
      },
    };
    saveDomainData(nextData);
    return nextList;
  },

  async updateKnowledgeDatasetTree(systemId: string, treeData: TreeNode[], currentUserId?: string): Promise<TreeNode[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextDetail = { ...detail, datasetTree: deepClone(treeData) };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDetail.datasetTree;
  },

  async createDataset(
    systemId: string,
    payload: Pick<DatasetItem, "name" | "periodType" | "description"> & { fieldCount?: number; boundDimensionCount?: number },
    currentUserId?: string,
  ): Promise<DatasetItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const newItem: DatasetItem = {
      id: createId("ds"),
      name: payload.name,
      periodType: payload.periodType,
      description: payload.description ?? "",
      fieldCount: payload.fieldCount ?? 0,
      boundDimensionCount: payload.boundDimensionCount ?? 0,
    };
    const nextDatasets = [newItem, ...detail.datasets];
    const nextDetail = { ...detail, datasets: nextDatasets };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDatasets;
  },

  async updateDataset(
    systemId: string,
    datasetId: string,
    payload: Partial<Pick<DatasetItem, "name" | "periodType" | "description" | "fieldCount" | "boundDimensionCount">>,
    currentUserId?: string,
  ): Promise<DatasetItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextDatasets = detail.datasets.map((d) =>
      d.id === datasetId ? { ...d, ...payload } : d,
    );
    const nextDetail = { ...detail, datasets: nextDatasets };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDatasets;
  },

  async importFromFile(payload: {
    knowledgeSystemId: string;
    sourceType: "file_csv" | "file_excel" | "file_json";
    tableName: string;
    fieldCount: number;
    rowCount: number;
    primaryKey?: string;
    sampleRows?: Record<string, unknown>[];
  }): Promise<ImportedTable> {
    await delay();
    const data = loadDomainData();
    const newTable: ImportedTable = {
      id: createId("it"),
      name: payload.tableName,
      sourceType: payload.sourceType,
      fieldCount: payload.fieldCount,
      rowCount: payload.rowCount,
      primaryKey: payload.primaryKey ?? "",
      updatedAt: nowText(),
      knowledgeSystemId: payload.knowledgeSystemId,
      sampleRows: payload.sampleRows ?? [],
    };
    const nextTables = [newTable, ...(data.importedTables ?? [])];
    saveDomainData({ ...data, importedTables: nextTables });
    return newTable;
  },

  async importFromDatabase(payload: {
    knowledgeSystemId: string;
    sourceType: "mysql" | "postgresql";
    tableName: string;
    fieldCount: number;
    rowCount: number;
    primaryKey?: string;
    connectionInfo?: string;
  }): Promise<ImportedTable> {
    await delay();
    const data = loadDomainData();
    const newTable: ImportedTable = {
      id: createId("it"),
      name: payload.tableName,
      sourceType: payload.sourceType,
      fieldCount: payload.fieldCount,
      rowCount: payload.rowCount,
      primaryKey: payload.primaryKey ?? "",
      updatedAt: nowText(),
      knowledgeSystemId: payload.knowledgeSystemId,
      sampleRows: [],
    };
    const nextTables = [newTable, ...(data.importedTables ?? [])];
    saveDomainData({ ...data, importedTables: nextTables });
    return newTable;
  },

  async bindTableToDataset(payload: {
    knowledgeSystemId: string;
    datasetId: string;
    importedTableId: string;
    tableName: string;
    fieldCount: number;
    rowCount: number;
    primaryKey?: string;
    dataSourceLabel?: string;
  }): Promise<void> {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[payload.knowledgeSystemId];
    if (!detail) throw new Error("知识库不存在");
    const nextTables = (data.importedTables ?? []).map((t) =>
      t.id === payload.importedTableId
        ? { ...t, datasetId: payload.datasetId, knowledgeSystemId: payload.knowledgeSystemId }
        : t,
    );
    const updatedAt = nowText();
    const nextDatasets = detail.datasets.map((d) =>
      d.id === payload.datasetId
        ? {
            ...d,
            importedTableId: payload.importedTableId,
            fieldCount: payload.fieldCount,
            primaryKey: payload.primaryKey,
            dataSourceLabel: payload.dataSourceLabel ?? payload.tableName,
            updatedAt,
          }
        : d,
    );
    const nextDetail = { ...detail, datasets: nextDatasets };
    saveDomainData({
      ...data,
      importedTables: nextTables,
      knowledgeDetails: { ...data.knowledgeDetails, [payload.knowledgeSystemId]: nextDetail },
    });
  },

  async getDatasetDetail(systemId: string, datasetId: string): Promise<DatasetDetailView | null> {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) return null;
    const dataset = detail.datasets.find((d) => d.id === datasetId);
    if (!dataset) return null;
    const importedTable =
      dataset.importedTableId && data.importedTables
        ? data.importedTables.find((t) => t.id === dataset.importedTableId) ?? null
        : null;
    const sampleRows =
      importedTable && Array.isArray(importedTable.sampleRows) && importedTable.sampleRows.length > 0
        ? importedTable.sampleRows
        : Array.from({ length: Math.min(10, dataset.fieldCount || 5) }, (_, i) => {
            const row: Record<string, unknown> = {};
            for (let c = 0; c < Math.min(dataset.fieldCount || 5, 8); c++) {
              row[`col_${c}`] = `sample_${i}_${c}`;
            }
            return row;
          });
    return {
      dataset: { ...dataset, updatedAt: dataset.updatedAt ?? nowText() },
      importedTable: importedTable ?? undefined,
      sampleRows,
    };
  },

  async getDatasetSample(systemId: string, datasetId: string, limit: number): Promise<Record<string, unknown>[]> {
    await delay();
    const view = await domainApi.getDatasetDetail(systemId, datasetId);
    if (!view) return [];
    return view.sampleRows.slice(0, limit);
  },

  async runReadOnlyQuery(
    systemId: string,
    datasetId: string,
    sql: string,
    page: number,
    pageSize: number,
  ): Promise<ReadOnlyQueryResult> {
    await delay();
    const writeKeywords = /(\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b|\bCREATE\b|\bTRUNCATE\b)/i;
    if (writeKeywords.test(sql)) {
      throw new Error("仅支持 SELECT 只读查询");
    }
    const view = await domainApi.getDatasetDetail(systemId, datasetId);
    if (!view) throw new Error("数据集不存在");
    const allRows = view.sampleRows;
    const total = allRows.length;
    const start = (page - 1) * pageSize;
    const rows = allRows.slice(start, start + pageSize);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows, total };
  },

  async updateKnowledgeMetricTree(systemId: string, treeData: TreeNode[], currentUserId?: string): Promise<TreeNode[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextDetail = { ...detail, metricTree: deepClone(treeData) };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDetail.metricTree;
  },

  async createMetric(
    systemId: string,
    payload: Pick<MetricItem, "name" | "metricType" | "definition" | "code">,
    currentUserId?: string,
  ): Promise<MetricItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const newItem: MetricItem = {
      id: createId("mt"),
      name: payload.name,
      metricType: payload.metricType,
      definition: payload.definition,
      code: payload.code,
    };
    const nextMetrics = [newItem, ...detail.metrics];
    const nextDetail = { ...detail, metrics: nextMetrics };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextMetrics;
  },

  async updateMetric(
    systemId: string,
    metricId: string,
    payload: Partial<Pick<MetricItem, "name" | "metricType" | "definition" | "code">>,
    currentUserId?: string,
  ): Promise<MetricItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextMetrics = detail.metrics.map((m) => (m.id === metricId ? { ...m, ...payload } : m));
    const nextDetail = { ...detail, metrics: nextMetrics };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextMetrics;
  },

  async updateKnowledgeDimensionTree(systemId: string, treeData: TreeNode[], currentUserId?: string): Promise<TreeNode[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextDetail = { ...detail, dimensionTree: deepClone(treeData) };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDetail.dimensionTree;
  },

  async createDimension(
    systemId: string,
    payload: Pick<DimensionItem, "name" | "code" | "parentName" | "valueConstraint">,
    currentUserId?: string,
  ): Promise<DimensionItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const newItem: DimensionItem = {
      id: createId("dim"),
      name: payload.name,
      code: payload.code,
      parentName: payload.parentName ?? "-",
      valueConstraint: payload.valueConstraint ?? "",
    };
    const nextDimensions = [newItem, ...detail.dimensions];
    const nextDetail = { ...detail, dimensions: nextDimensions };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDimensions;
  },

  async updateDimension(
    systemId: string,
    dimensionId: string,
    payload: Partial<Pick<DimensionItem, "name" | "code" | "parentName" | "valueConstraint">>,
    currentUserId?: string,
  ): Promise<DimensionItem[]> {
    await delay();
    this.ensureKnowledgeSystemCreator(systemId, currentUserId);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) throw new Error("知识库不存在");
    const nextDimensions = detail.dimensions.map((d) =>
      d.id === dimensionId ? { ...d, ...payload } : d,
    );
    const nextDetail = { ...detail, dimensions: nextDimensions };
    const nextData = {
      ...data,
      knowledgeDetails: { ...data.knowledgeDetails, [systemId]: nextDetail },
    };
    saveDomainData(nextData);
    return nextDimensions;
  },

  async getMetricKnowledgeLinks(systemId: string): Promise<MetricKnowledgeLink[]> {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) return [];
    const metricIds = new Set(detail.metrics.map((m) => m.id));
    return (data.metricKnowledgeLinks ?? []).filter((l) => metricIds.has(l.metricId));
  },

  async setMetricKnowledgeLink(
    systemId: string,
    metricId: string,
    payload: { knowledgeSystemId: string; termIds: string[] },
  ): Promise<MetricKnowledgeLink[]> {
    await delay();
    const data = loadDomainData();
    const links = data.metricKnowledgeLinks ?? [];
    const rest = links.filter((l) => l.metricId !== metricId);
    const nextLinks = payload.termIds.length
      ? [...rest, { metricId, knowledgeSystemId: payload.knowledgeSystemId, termIds: payload.termIds }]
      : rest;
    saveDomainData({ ...data, metricKnowledgeLinks: nextLinks });
    return nextLinks.filter((l) => data.knowledgeDetails[systemId]?.metrics.some((m) => m.id === l.metricId));
  },

  async getDimensionKnowledgeLinks(systemId: string): Promise<DimensionKnowledgeLink[]> {
    await delay();
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    if (!detail) return [];
    const dimensionIds = new Set(detail.dimensions.map((d) => d.id));
    return (data.dimensionKnowledgeLinks ?? []).filter((l) => dimensionIds.has(l.dimensionId));
  },

  async setDimensionKnowledgeLink(
    systemId: string,
    dimensionId: string,
    payload: { knowledgeSystemId: string; termIds: string[] },
  ): Promise<DimensionKnowledgeLink[]> {
    await delay();
    const data = loadDomainData();
    const links = data.dimensionKnowledgeLinks ?? [];
    const rest = links.filter((l) => l.dimensionId !== dimensionId);
    const nextLinks = payload.termIds.length
      ? [...rest, { dimensionId, knowledgeSystemId: payload.knowledgeSystemId, termIds: payload.termIds }]
      : rest;
    saveDomainData({ ...data, dimensionKnowledgeLinks: nextLinks });
    return nextLinks.filter((l) =>
      data.knowledgeDetails[systemId]?.dimensions.some((d) => d.id === l.dimensionId),
    );
  },

  async getLinksByGlossaryTerm(termId: string): Promise<{
    metricIds: string[];
    dimensionIds: string[];
    knowledgeEntries: { knowledgeSystemId: string; entryId: string; entryTitle: string; entryType: "metric" | "dimension" }[];
  }> {
    await delay();
    const data = loadDomainData();
    const metricLinks = (data.metricKnowledgeLinks ?? []).filter((l) => l.termIds.includes(termId));
    const dimensionLinks = (data.dimensionKnowledgeLinks ?? []).filter((l) => l.termIds.includes(termId));
    const metricIds = metricLinks.map((l) => l.metricId);
    const dimensionIds = dimensionLinks.map((l) => l.dimensionId);
    const sysName = (sid: string) => data.knowledgeSystems?.find((s) => s.id === sid)?.name ?? sid;
    const knowledgeEntries: { knowledgeSystemId: string; knowledgeSystemName?: string; entryId: string; entryTitle: string; entryType: "metric" | "dimension" }[] = [];
    for (const link of metricLinks) {
      const detail = data.knowledgeDetails[link.knowledgeSystemId];
      const metric = detail?.metrics.find((m) => m.id === link.metricId);
      if (metric) {
        knowledgeEntries.push({
          knowledgeSystemId: link.knowledgeSystemId,
          knowledgeSystemName: sysName(link.knowledgeSystemId),
          entryId: link.metricId,
          entryTitle: metric.name,
          entryType: "metric",
        });
      }
    }
    for (const link of dimensionLinks) {
      const detail = data.knowledgeDetails[link.knowledgeSystemId];
      const dimension = detail?.dimensions.find((d) => d.id === link.dimensionId);
      if (dimension) {
        knowledgeEntries.push({
          knowledgeSystemId: link.knowledgeSystemId,
          knowledgeSystemName: sysName(link.knowledgeSystemId),
          entryId: link.dimensionId,
          entryTitle: dimension.name,
          entryType: "dimension",
        });
      }
    }
    return { metricIds, dimensionIds, knowledgeEntries };
  },

  getTermsByKnowledgeEntry(systemId: string, entryId: string): string[] {
    const data = loadDomainData();
    return (data.termKnowledgeLinks ?? [])
      .filter((l) => l.knowledgeSystemId === systemId && l.entryId === entryId)
      .map((l) => l.termId);
  },

  getMetricSystemId(metricId: string): string | null {
    const data = loadDomainData();
    for (const [systemId, detail] of Object.entries(data.knowledgeDetails)) {
      if (detail.metrics.some((m) => m.id === metricId)) return systemId;
    }
    return null;
  },

  getDimensionSystemId(dimensionId: string): string | null {
    const data = loadDomainData();
    for (const [systemId, detail] of Object.entries(data.knowledgeDetails)) {
      if (detail.dimensions.some((d) => d.id === dimensionId)) return systemId;
    }
    return null;
  },

  async getPendingMetricSync(): Promise<string[]> {
    await delay();
    const data = loadDomainData();
    return data.pendingMetricSync ?? [];
  },

  async getPendingDimensionSync(): Promise<string[]> {
    await delay();
    const data = loadDomainData();
    return data.pendingDimensionSync ?? [];
  },

  async clearPendingMetricSync(): Promise<void> {
    await delay();
    const data = loadDomainData();
    saveDomainData({ ...data, pendingMetricSync: [] });
  },

  async clearPendingDimensionSync(): Promise<void> {
    await delay();
    const data = loadDomainData();
    saveDomainData({ ...data, pendingDimensionSync: [] });
  },

  async getGlossaryTerms(filter: GlossaryFilter): Promise<GlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    return data.glossaryTerms.filter((item) => {
      const knowledgeMatched = filter.knowledgeSystemId
        ? item.knowledgeSystemId === filter.knowledgeSystemId
        : true;
      const typeMatched = filter.termType ? item.termType === filter.termType : true;
      const keywordMatched = filter.keyword
        ? [item.term, ...item.synonyms, item.description]
            .join("|")
            .toLowerCase()
            .includes(filter.keyword.toLowerCase())
        : true;
      return knowledgeMatched && typeMatched && keywordMatched;
    });
  },

  async nl2SemiticQuery(naturalLanguage: string): Promise<{ hits: Nl2SemiticHit[] }> {
    await delay(200);
    const data = loadDomainData();
    const q = naturalLanguage.trim().toLowerCase();
    if (!q) return { hits: [] };
    const terms = data.glossaryTerms;
    const words = q.split(/\s+/).filter(Boolean);
    const matchedIds = new Set<string>();
    for (const t of terms) {
      const text = [t.term, ...(t.synonyms ?? []), t.description].join(" ").toLowerCase();
      if (words.some((w) => text.includes(w))) matchedIds.add(t.id);
    }
    const relatedIds = new Set<string>();
    for (const t of terms) {
      if (matchedIds.has(t.id) && t.relations?.length) {
        for (const r of t.relations) {
          relatedIds.add(r.targetTermId);
        }
      }
    }
    const conceptLabel = q.length > 20 ? q.slice(0, 20) + "…" : q;
    const termIdList = Array.from(matchedIds);
    const relatedIdList = Array.from(relatedIds).filter((id) => !matchedIds.has(id));
    const termMap = new Map(terms.map((t) => [t.id, t]));
    const hit: Nl2SemiticHit = {
      concept: conceptLabel,
      termIds: termIdList,
      relatedTermIds: relatedIdList,
      terms: termIdList.map((id) => termMap.get(id)).filter(Boolean) as GlossaryTerm[],
      relatedTerms: relatedIdList.map((id) => termMap.get(id)).filter(Boolean) as GlossaryTerm[],
    };
    if (hit.termIds.length === 0 && hit.relatedTermIds.length === 0) return { hits: [] };
    return { hits: [hit] };
  },

  async getGlossaryTermById(id: string): Promise<GlossaryTerm | null> {
    await delay(120);
    const data = loadDomainData();
    return data.glossaryTerms.find((item) => item.id === id) ?? null;
  },

  async saveGlossaryTerm(term: GlossaryTerm): Promise<GlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    const exists = data.glossaryTerms.some((item) => item.id === term.id);
    const next: GlossaryTerm[] = exists
      ? data.glossaryTerms.map((item) => (item.id === term.id ? term : item))
      : [{ ...term, id: createId("gt"), updatedAt: nowText() }, ...data.glossaryTerms];
    const nextData = { ...data, glossaryTerms: next };
    const affectedMetricIds = (nextData.metricKnowledgeLinks ?? [])
      .filter((l) => l.termIds.includes(term.id))
      .map((l) => l.metricId);
    const affectedDimensionIds = (nextData.dimensionKnowledgeLinks ?? [])
      .filter((l) => l.termIds.includes(term.id))
      .map((l) => l.dimensionId);
    nextData.pendingMetricSync = [...new Set([...(nextData.pendingMetricSync ?? []), ...affectedMetricIds])];
    nextData.pendingDimensionSync = [...new Set([...(nextData.pendingDimensionSync ?? []), ...affectedDimensionIds])];
    saveDomainData(nextData);
    return next;
  },

  async removeGlossaryTerms(ids: string[]): Promise<GlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    const next = data.glossaryTerms.filter((item) => !ids.includes(item.id));
    const nextData = { ...data, glossaryTerms: next };
    const affectedMetricIds = (nextData.metricKnowledgeLinks ?? [])
      .filter((l) => l.termIds.some((tid) => ids.includes(tid)))
      .map((l) => l.metricId);
    const affectedDimensionIds = (nextData.dimensionKnowledgeLinks ?? [])
      .filter((l) => l.termIds.some((tid) => ids.includes(tid)))
      .map((l) => l.dimensionId);
    nextData.pendingMetricSync = [...new Set([...(nextData.pendingMetricSync ?? []), ...affectedMetricIds])];
    nextData.pendingDimensionSync = [...new Set([...(nextData.pendingDimensionSync ?? []), ...affectedDimensionIds])];
    saveDomainData(nextData);
    return next;
  },

  async getPendingGlossaryTerms(): Promise<PendingGlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    return data.pendingGlossaryTerms ?? [];
  },

  async getPendingGlossaryTermsCount(): Promise<number> {
    await delay();
    const data = loadDomainData();
    return (data.pendingGlossaryTerms ?? []).length;
  },

  /** 查找与给定术语相似或重复的已有术语（POC：包含关系 + 归一化相等） */
  async getSimilarGlossaryTerms(term: string): Promise<GlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    const normalized = term.trim().toLowerCase();
    if (!normalized) return [];
    return data.glossaryTerms.filter((t) => {
      const tNorm = t.term.trim().toLowerCase();
      if (tNorm === normalized) return true;
      if (tNorm.includes(normalized) || normalized.includes(tNorm)) return true;
      const syns = (t.synonyms ?? []).map((s) => s.trim().toLowerCase());
      if (syns.includes(normalized) || syns.some((s) => s.includes(normalized) || normalized.includes(s)))
        return true;
      return false;
    });
  },

  async confirmPendingTerm(
    pendingId: string,
    edits?: { description?: string; domain?: string; knowledgeSystemId?: string; knowledgeSystemName?: string },
    options?: { linkToTermId?: string; runOntologyExtract?: boolean; logContext?: { operator: string; operatorId?: string } },
  ): Promise<GlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    const pending = (data.pendingGlossaryTerms ?? []).find((p) => p.id === pendingId);
    if (!pending) return data.glossaryTerms;
    const ksId = edits?.knowledgeSystemId ?? data.knowledgeSystems[0]?.id ?? "";
    const ksName = edits?.knowledgeSystemName ?? data.knowledgeSystems.find((k) => k.id === ksId)?.name ?? "默认知识库";
    const similarExisting = await this.getSimilarGlossaryTerms(pending.term);
    const linkToTermId = options?.linkToTermId ?? similarExisting[0]?.id;
    const newTerm: GlossaryTerm = {
      id: createId("gt"),
      knowledgeSystemId: ksId,
      knowledgeSystemName: ksName,
      term: pending.term,
      synonyms: linkToTermId ? [data.glossaryTerms.find((t) => t.id === linkToTermId)?.term ?? ""].filter(Boolean) : [],
      description: edits?.description ?? pending.description,
      termType: "全局",
      fieldMapping: "",
      exampleUsage: "",
      valueMapping: "{}",
      sqlSnippet: "",
      updatedBy: "系统",
      updatedAt: nowText(),
      status: "enabled",
      references: [],
      relations:
        linkToTermId != null
          ? [{ type: "synonym" as const, targetTermId: linkToTermId }]
          : undefined,
    };
    const nextTerms = [newTerm, ...data.glossaryTerms];
    const nextPending = (data.pendingGlossaryTerms ?? []).filter((p) => p.id !== pendingId);
    saveDomainData({ ...data, glossaryTerms: nextTerms, pendingGlossaryTerms: nextPending });

    if (options?.runOntologyExtract !== false && options?.logContext) {
      try {
        let data2 = loadDomainData();
        let libs = data2.ontologyLibraries ?? [];
        if (libs.length === 0) {
          await this.createOntologyLibrary({
            name: "默认业务本体库",
            description: "由术语确认自动创建",
            domain: "移动业务",
          });
          data2 = loadDomainData();
          libs = data2.ontologyLibraries ?? [];
        }
        const libraryId = libs[0].id;
        const concepts = (data2.ontologyConcepts ?? []).filter((c) => c.libraryId === libraryId);
        let concept = concepts.find((c) => c.name === "业务术语");
        if (!concept) {
          concept = await this.createOntologyConcept({
            libraryId,
            name: "业务术语",
            description: "从待确认术语归类抽取",
          });
        }
        await this.createOntologyMapping({
          conceptId: concept.id,
          targetType: "glossaryTerm",
          targetId: newTerm.id,
        });
        this.appendOperationLog({
          module: "glossary",
          moduleName: "业务术语词典",
          actionType: "关联",
          actionSummary: `本体抽取：术语「${newTerm.term}」关联至本体概念「${concept.name}」`,
          relatedObject: newTerm.term,
          operator: options.logContext.operator,
          operatorId: options.logContext.operatorId,
          status: "成功",
        });
      } catch {
        // POC: ignore ontology extract failure
      }
    }
    return nextTerms;
  },

  async rejectPendingTerms(ids: string[]): Promise<PendingGlossaryTerm[]> {
    await delay();
    const data = loadDomainData();
    const next = (data.pendingGlossaryTerms ?? []).filter((p) => !ids.includes(p.id));
    saveDomainData({ ...data, pendingGlossaryTerms: next });
    return next;
  },

  /**
   * 从 Skill 提取术语并写入待确认池。新建与导入成功的 Skill 均执行（不再仅限外部来源）。
   * 若该 Skill 已有待确认术语则跳过，避免重复。
   * @returns 本次新增的待确认术语数量
   */
  async appendPendingGlossaryTermsFromSkill(skill: SkillItem): Promise<number> {
    const data = loadDomainData();
    const pending = data.pendingGlossaryTerms ?? [];
    if (pending.some((p) => p.sourceSkillId === skill.id)) return 0;
    const candidates = extractTermsFromSkillContent(
      skill.name,
      skill.content ?? "",
      skill.summary ?? "",
    );
    if (candidates.length === 0) return 0;
    const now = nowText();
    const newEntries: PendingGlossaryTerm[] = candidates.map((c) => ({
      id: createId("pgt"),
      term: c.term,
      sourceSkillId: skill.id,
      sourceSkillName: skill.name,
      domain: c.suggestedDomain,
      description: c.contextSnippet,
      createdAt: now,
    }));
    saveDomainData({
      ...data,
      pendingGlossaryTerms: [...pending, ...newEntries],
    });
    return newEntries.length;
  },

  /** Skill 保存后创建或更新 1 条语义知识库条目（1 Skill → 1 条） */
  async upsertSkillKnowledgeEntry(skill: SkillItem): Promise<void> {
    const data = loadDomainData();
    const entries = data.skillKnowledgeEntries ?? [];
    const existing = entries.find((e) => e.skillId === skill.id);
    const extractedTermIds = (data.pendingGlossaryTerms ?? [])
      .filter((p) => p.sourceSkillId === skill.id)
      .map((p) => p.id);
    const now = nowText();
    const source: "skill_create" | "external_import" =
      skill.importSource === "file_md" || skill.importSource === "file_docx" || skill.importSource === "file_xlsx" || getSkillSourceType(skill) === "external_crawl"
        ? "external_import"
        : "skill_create";
    const base = {
      title: skill.name,
      summary: skill.summary ?? "",
      triggerCondition: (skill.triggerCondition ?? "").trim() || "-",
      inputSpec: (skill.inputSpec ?? "").trim() || "-",
      steps: (skill.steps ?? "").trim() || "-",
      checkCriteria: (skill.checkCriteria ?? "").trim() || "-",
      abortCondition: (skill.abortCondition ?? "").trim() || "-",
      recoveryMethod: (skill.recoveryMethod ?? "").trim() || "-",
      extractedTermIds,
      attachments: [] as Array<{ type: "table" | "document" | "sql" | "other"; name: string; content?: string }>,
      source,
      crawlChannel: skill.crawlChannel,
      crawledAt: skill.crawledAt,
      updatedAt: now,
    };
    if (existing) {
      const versionHistory = [...(existing.versionHistory ?? []), { at: now, summary: `更新：${skill.name}` }].slice(-10);
      const next = entries.map((e) =>
        e.skillId === skill.id ? { ...e, ...base, versionHistory } : e,
      );
      saveDomainData({ ...data, skillKnowledgeEntries: next });
    } else {
      const newEntry: SkillKnowledgeEntry = {
        ...base,
        id: createId("ske"),
        skillId: skill.id,
        createdAt: now,
      };
      saveDomainData({ ...data, skillKnowledgeEntries: [...entries, newEntry] });
    }
  },

  async toggleGlossaryStatus(id: string, enabled: boolean): Promise<GlossaryTerm[]> {
    await delay(120);
    const data = loadDomainData();
    const next: GlossaryTerm[] = data.glossaryTerms.map((item) =>
      item.id === id
        ? {
            ...item,
            status: (enabled ? "enabled" : "disabled") as GlossaryTerm["status"],
            updatedAt: nowText(),
          }
        : item,
    );
    saveDomainData({ ...data, glossaryTerms: next });
    return next;
  },

  async getExampleQuestions(filter: ExampleQuestionFilter): Promise<ExampleQuestion[]> {
    await delay();
    const data = loadDomainData();
    if (!filter.keyword?.trim()) {
      return data.exampleQuestions;
    }
    const q = filter.keyword.toLowerCase();
    return data.exampleQuestions.filter(
      (item) => item.question.toLowerCase().includes(q) || item.sql.toLowerCase().includes(q),
    );
  },

  async saveExampleQuestion(record: ExampleQuestion): Promise<ExampleQuestion[]> {
    await delay();
    const data = loadDomainData();
    const exists = data.exampleQuestions.some((item) => item.id === record.id);
    const payload = {
      ...record,
      updatedAt: nowText(),
    };
    const next: ExampleQuestion[] = exists
      ? data.exampleQuestions.map((item) => (item.id === record.id ? payload : item))
      : [{ ...payload, id: createId("eq") }, ...data.exampleQuestions];
    saveDomainData({ ...data, exampleQuestions: next });
    return next;
  },

  async removeExampleQuestion(id: string): Promise<ExampleQuestion[]> {
    await delay();
    const data = loadDomainData();
    const next = data.exampleQuestions.filter((item) => item.id !== id);
    saveDomainData({ ...data, exampleQuestions: next });
    return next;
  },

  async toggleExampleQuestion(id: string, enabled: boolean): Promise<ExampleQuestion[]> {
    await delay(120);
    const data = loadDomainData();
    const next: ExampleQuestion[] = data.exampleQuestions.map((item) =>
      item.id === id
        ? {
            ...item,
            status: (enabled ? "enabled" : "disabled") as ExampleQuestion["status"],
            updatedAt: nowText(),
          }
        : item,
    );
    saveDomainData({ ...data, exampleQuestions: next });
    return next;
  },

  async getTraceDashboard(filter: TraceFilter) {
    await delay();
    const data = loadDomainData();
    const keyword = filter.keyword?.trim();
    const records = data.traceRecords.filter((item) => {
      const keywordMatched = keyword
        ? [item.question, item.parsedIntent, item.model].join("|").includes(keyword)
        : true;
      const statusMatched = filter.status && filter.status !== "全部" ? item.status === filter.status : true;
      const modelMatched = filter.model && filter.model !== "全部" ? item.model === filter.model : true;
      return keywordMatched && statusMatched && modelMatched;
    });
    return {
      stats: data.traceStats,
      trend: data.traceTrend,
      records,
    };
  },

  /** 解析时间范围为 [start, end] 日期字符串（YYYY-MM-DD），用于按 createdAt 过滤 */
  _resolveTimeRange(filter: { timeRange?: string; startDate?: string; endDate?: string }): { start: string; end: string } | null {
    const now = new Date();
    const toYmd = (d: Date) => d.toISOString().slice(0, 10);
    if (filter.timeRange === "today") {
      const t = toYmd(now);
      return { start: t, end: t };
    }
    if (filter.timeRange === "yesterday") {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const t = toYmd(y);
      return { start: t, end: t };
    }
    if (filter.timeRange === "7d") {
      const end = toYmd(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { start: toYmd(start), end };
    }
    if (filter.timeRange === "30d") {
      const end = toYmd(now);
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { start: toYmd(start), end };
    }
    if (filter.timeRange === "custom" && filter.startDate && filter.endDate) {
      return { start: filter.startDate.slice(0, 10), end: filter.endDate.slice(0, 10) };
    }
    return null;
  },

  async getOperationLogs(filter: OperationLogFilter): Promise<{
    list: OperationLogEntry[];
    total: number;
    /** 当前筛选条件下各模块条数（用于底部占比展示） */
    byModule: { module: OperationLogModule; moduleName: string; count: number }[];
  }> {
    await delay();
    const data = loadDomainData();
    let list = [...(data.operationLogs ?? [])];
    const range = this._resolveTimeRange(filter);
    if (range) {
      list = list.filter((item) => {
        const day = item.createdAt.slice(0, 10);
        return day >= range.start && day <= range.end;
      });
    }
    if (filter.modules?.length) {
      const set = new Set(filter.modules);
      list = list.filter((item) => set.has(item.module));
    }
    if (filter.operator?.trim()) {
      const q = filter.operator.trim().toLowerCase();
      list = list.filter((item) => item.operator.toLowerCase().includes(q));
    }
    if (filter.keyword?.trim()) {
      const q = filter.keyword.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.actionSummary.toLowerCase().includes(q) ||
          (item.relatedObject ?? "").toLowerCase().includes(q) ||
          (item.failReason ?? "").toLowerCase().includes(q) ||
          item.moduleName.toLowerCase().includes(q),
      );
    }
    if (filter.operationLogId?.trim()) {
      list = list.filter((item) => item.id === filter.operationLogId!.trim());
    }
    if (filter.resultSource) {
      list = list.filter((item) => item.module === "metrics_qa" && item.resultSource === filter.resultSource);
    }
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
    const total = list.length;
    const moduleNames: Record<OperationLogModule, string> = {
      metrics_qa: "经营指标问数",
      skill_lib: "Skill 库",
      knowledge: "语义知识库",
      example_qa: "示例问题库",
      glossary: "业务术语词典",
      question_labeling: "样本打标",
    };
    const byModuleMap = new Map<OperationLogModule, number>();
    for (const entry of list) {
      byModuleMap.set(entry.module, (byModuleMap.get(entry.module) ?? 0) + 1);
    }
    const byModule = Array.from(byModuleMap.entries()).map(([module, count]) => ({
      module,
      moduleName: moduleNames[module] ?? module,
      count,
    }));
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, filter.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    list = list.slice(start, start + pageSize);
    return { list, total, byModule };
  },

  appendOperationLog(entry: Omit<OperationLogEntry, "id" | "createdAt">): OperationLogEntry {
    const data = loadDomainData();
    const now = nowText();
    const full: OperationLogEntry = {
      ...entry,
      id: createId("op"),
      createdAt: now,
    };
    const next = [full, ...(data.operationLogs ?? [])];
    saveDomainData({ ...data, operationLogs: next });
    return full;
  },

  saveMetricQAHistory(
    entry: Omit<MetricQAHistoryEntry, "id" | "createdAt"> | (Pick<MetricQAHistoryEntry, "id"> & Partial<Pick<MetricQAHistoryEntry, "editedSql" | "executeResult" | "operationLogId">>),
  ): MetricQAHistoryEntry {
    const data = loadDomainData();
    const list = data.metricQAHistory ?? [];
    const now = nowText();
    const hasId = "id" in entry && entry.id;
    if (hasId && typeof (entry as MetricQAHistoryEntry).id === "string") {
      const idx = list.findIndex((e) => e.id === (entry as MetricQAHistoryEntry).id);
      if (idx >= 0) {
        const next = [...list];
        const incoming = entry as MetricQAHistoryEntry;
        next[idx] = {
          ...next[idx],
          editedSql: incoming.editedSql ?? next[idx].editedSql,
          executeResult: incoming.executeResult ?? next[idx].executeResult,
          operationLogId: incoming.operationLogId ?? next[idx].operationLogId,
        };
        saveDomainData({ ...data, metricQAHistory: next });
        return next[idx];
      }
    }
    const newEntry: MetricQAHistoryEntry = {
      ...entry,
      id: createId("mqa"),
      createdAt: now,
    } as MetricQAHistoryEntry;
    saveDomainData({ ...data, metricQAHistory: [newEntry, ...list] });
    return newEntry;
  },

  async getMetricQAHistory(filter: {
    operatorId: string;
    timeRange?: "today" | "yesterday" | "7d" | "30d" | "custom";
    startDate?: string;
    endDate?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ list: MetricQAHistoryEntry[]; total: number }> {
    await delay();
    const data = loadDomainData();
    let list = (data.metricQAHistory ?? []).filter((e) => e.operatorId === filter.operatorId);
    const range = this._resolveTimeRange({
      timeRange: filter.timeRange,
      startDate: filter.startDate,
      endDate: filter.endDate,
    });
    if (range) {
      list = list.filter((e) => {
        const day = e.createdAt.slice(0, 10);
        return day >= range.start && day <= range.end;
      });
    }
    if (filter.keyword?.trim()) {
      const q = filter.keyword.trim().toLowerCase();
      list = list.filter((e) => e.question.toLowerCase().includes(q));
    }
    list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0));
    const total = list.length;
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, filter.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    list = list.slice(start, start + pageSize);
    return { list, total };
  },

  deleteMetricQAHistory(ids: string[], operatorId: string): void {
    const data = loadDomainData();
    const set = new Set(ids);
    const next = (data.metricQAHistory ?? []).filter((e) => !(set.has(e.id) && e.operatorId === operatorId));
    saveDomainData({ ...data, metricQAHistory: next });
  },

  async getModelUsageStats(filter: ModelUsageFilter): Promise<{
    list: ModelUsageEntry[];
    total: number;
    summary: {
      totalCalls: number;
      totalPromptTokens: number;
      totalCompletionTokens: number;
      totalTokens: number;
      totalCost: number;
      byDay: { date: string; calls: number; promptTokens: number; completionTokens: number; cost: number }[];
      byModule: { module: OperationLogModule; moduleName: string; calls: number; cost: number }[];
    };
  }> {
    await delay();
    const data = loadDomainData();
    let list = [...(data.modelUsageRecords ?? [])];
    const range = this._resolveTimeRange(filter);
    if (range) {
      list = list.filter((item) => {
        const day = item.requestAt.slice(0, 10);
        return day >= range.start && day <= range.end;
      });
    }
    if (filter.operatorId?.trim()) {
      list = list.filter((item) => item.operatorId === filter.operatorId);
    }
    if (filter.module) {
      list = list.filter((item) => item.module === filter.module);
    }
    list.sort((a, b) => (b.requestAt > a.requestAt ? 1 : b.requestAt < a.requestAt ? -1 : 0));
    const total = list.length;
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, filter.pageSize ?? 20));
    const start = (page - 1) * pageSize;
    const pagedList = list.slice(start, start + pageSize);

    const summary = {
      totalCalls: list.length,
      totalPromptTokens: list.reduce((s, i) => s + (i.promptTokens ?? 0), 0),
      totalCompletionTokens: list.reduce((s, i) => s + (i.completionTokens ?? 0), 0),
      totalTokens: list.reduce((s, i) => s + (i.totalTokens ?? 0), 0),
      totalCost: list.reduce((s, i) => s + (i.cost ?? 0), 0),
      byDay: [] as { date: string; calls: number; promptTokens: number; completionTokens: number; cost: number }[],
      byModule: [] as { module: OperationLogModule; moduleName: string; calls: number; cost: number }[],
    };
    const dayMap = new Map<string, { calls: number; promptTokens: number; completionTokens: number; cost: number }>();
    const moduleMap = new Map<
      OperationLogModule,
      { moduleName: string; calls: number; cost: number }
    >();
    const moduleNames: Record<OperationLogModule, string> = {
      metrics_qa: "经营指标问数",
      skill_lib: "Skill 库",
      knowledge: "语义知识库",
      example_qa: "示例问题库",
      glossary: "业务术语词典",
      question_labeling: "样本打标",
    };
    for (const u of list) {
      const day = u.requestAt.slice(0, 10);
      const d = dayMap.get(day) ?? { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
      d.calls += 1;
      d.promptTokens += u.promptTokens ?? 0;
      d.completionTokens += u.completionTokens ?? 0;
      d.cost += u.cost ?? 0;
      dayMap.set(day, d);
      const m = moduleMap.get(u.module) ?? { moduleName: moduleNames[u.module] ?? u.module, calls: 0, cost: 0 };
      m.calls += 1;
      m.cost += u.cost ?? 0;
      moduleMap.set(u.module, m);
    }
    summary.byDay = Array.from(dayMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));
    summary.byModule = Array.from(moduleMap.entries()).map(([module, v]) => ({ module, ...v }));
    return { list: pagedList, total, summary };
  },

  appendModelUsage(entry: Omit<ModelUsageEntry, "id">): ModelUsageEntry {
    const data = loadDomainData();
    const full: ModelUsageEntry = {
      ...entry,
      id: createId("mu"),
    };
    const next = [full, ...(data.modelUsageRecords ?? [])];
    saveDomainData({ ...data, modelUsageRecords: next });
    return full;
  },

  getOperationLogOperators(): string[] {
    const data = loadDomainData();
    const set = new Set((data.operationLogs ?? []).map((item) => item.operator).filter(Boolean));
    return Array.from(set).sort();
  },

  /** 模型用量统计用：按操作人筛选时的操作人列表（operatorId -> operatorName） */
  getModelUsageOperators(): { operatorId: string; operatorName: string }[] {
    const data = loadDomainData();
    const map = new Map<string, string>();
    for (const u of data.modelUsageRecords ?? []) {
      const id = u.operatorId ?? "";
      const name = (u.operatorName ?? (id || "未知")).trim();
      if (id || name) map.set(id || name, name || id);
    }
    return Array.from(map.entries())
      .map(([operatorId, operatorName]) => ({ operatorId, operatorName }))
      .sort((a, b) => a.operatorName.localeCompare(b.operatorName));
  },

  async getSkillRanking(
    filter: SkillFilter,
  ): Promise<{ list: SkillItem[]; total: number; lastSyncAt: string; sourceCounts?: { own: number; external_crawl: number } }> {
    await delay();
    const data = loadDomainData();
    const { customSkills, officialSkills } = loadSkillBuckets(data);
    const merged = dedupeSkillItems([...customSkills, ...officialSkills]);
    const fullList = toSkillList(officialSkills, customSkills, filter);
    const pageSize = Math.max(1, filter.pageSize ?? 10);
    const page = Math.max(1, filter.page ?? 1);
    const total = fullList.length;
    const start = (page - 1) * pageSize;
    const list = fullList.slice(start, start + pageSize);
    const sourceCounts = {
      own: merged.filter((i) => getSkillSourceType(i) === "own").length,
      external_crawl: merged.filter((i) => getSkillSourceType(i) === "external_crawl").length,
    };
    return {
      list,
      total,
      lastSyncAt: data.lastSkillSyncAt,
      sourceCounts,
    };
  },

  async getSkillById(id: string): Promise<SkillItem | null> {
    await delay(120);
    const data = loadDomainData();
    const { customSkills, officialSkills } = loadSkillBuckets(data);
    const target = dedupeSkillItems([...customSkills, ...officialSkills]).find((item) => item.id === id) ?? null;
    if (!target || target.isCustom) {
      return target;
    }
    try {
      const detailed = await fetchSkillProxyDetail(target);
      if (!detailed) {
        return target;
      }
      const nextOfficial = officialSkills.map((item) => (item.id === detailed.id ? detailed : item));
      saveMergedSkillItems(data, customSkills, nextOfficial, data.lastSkillSyncAt);
      return detailed;
    } catch {
      return target;
    }
  },

  async getSkillKnowledgeEntries(): Promise<SkillKnowledgeEntry[]> {
    await delay();
    const data = loadDomainData();
    return data.skillKnowledgeEntries ?? [];
  },

  async getSkillKnowledgeEntryBySkillId(skillId: string): Promise<SkillKnowledgeEntry | null> {
    await delay();
    const data = loadDomainData();
    const list = data.skillKnowledgeEntries ?? [];
    return list.find((e) => e.skillId === skillId) ?? null;
  },

  async saveSkill(
    item: SkillItem,
    username: string,
    createdByUserId?: string,
    logContext?: { operator: string; operatorId?: string },
  ): Promise<SkillItem[]> {
    await delay();
    const data = loadDomainData();
    const { customSkills, officialSkills } = loadSkillBuckets(data);
    const existingCustom = customSkills.find((skill) => skill.id === item.id);
    const existingOfficial = officialSkills.find((skill) => skill.id === item.id);

    if (existingCustom && existingCustom.createdByUserId != null && createdByUserId != null && existingCustom.createdByUserId !== createdByUserId) {
      throw new Error("无权限修改该 Skill，仅创建者可编辑");
    }

    const buildCustomSkill = (seed: SkillItem, targetId: string): SkillItem => {
      const resolvedCreator = createdByUserId ?? item.createdByUserId ?? seed.createdByUserId;
      return {
        ...seed,
        ...item,
        id: targetId,
        rank: undefined,
        source: "user",
        sourceUrl: undefined,
        owner: undefined,
        repository: undefined,
        skillSlug: undefined,
        installsText: undefined,
        installsCount: undefined,
        author: username,
        updatedAt: nowText(),
        isCustom: true,
        category: item.category ?? seed.category ?? "用户创建",
        status: item.status ?? "enabled",
        createdByUserId: resolvedCreator,
        isOfficial: false,
        version: item.version ?? seed.version ?? "1.0",
        importSource: item.importSource ?? seed.importSource ?? "manual",
      };
    };

    const nextCustomSkills = existingCustom
      ? customSkills.map((skill) =>
          skill.id === existingCustom.id ? buildCustomSkill(existingCustom, existingCustom.id) : skill,
        )
      : [
          buildCustomSkill(existingOfficial ?? item, createId("skill")),
          ...customSkills,
        ];

    const merged = saveMergedSkillItems(data, nextCustomSkills, officialSkills, data.lastSkillSyncAt);
    const savedSkill = existingCustom
      ? merged.find((s) => s.id === existingCustom.id)
      : merged.find((s) => s.id === nextCustomSkills[0].id);
    if (savedSkill) {
      const termsAdded = await this.appendPendingGlossaryTermsFromSkill(savedSkill);
      if (termsAdded > 0 && logContext) {
        this.appendOperationLog({
          module: "glossary",
          moduleName: "业务术语词典",
          actionType: "导入",
          actionSummary: `术语自动提取：从 Skill「${savedSkill.name}」提取 ${termsAdded} 条待确认术语`,
          relatedObject: savedSkill.name,
          operator: logContext.operator,
          operatorId: logContext.operatorId,
          status: "成功",
        });
      }
      await this.upsertSkillKnowledgeEntry(savedSkill);
      const creatorId = savedSkill.createdByUserId ?? createdByUserId;
      const hasKs = (loadDomainData().knowledgeSystems ?? []).some((k) => k.skillId === savedSkill.id);
      if (!hasKs && creatorId) {
        await this.createKnowledgeSystem(savedSkill.id, savedSkill.name, savedSkill.summary, creatorId);
      }
    }
    return merged;
  },

  async toggleSkillStatus(skillId: string, enabled: boolean, currentUserId?: string): Promise<SkillItem[]> {
    await delay(100);
    const data = loadDomainData();
    const { customSkills, officialSkills } = loadSkillBuckets(data);
    const skill = [...customSkills, ...officialSkills].find((s) => s.id === skillId);
    if (skill?.isCustom && skill.createdByUserId != null && currentUserId != null && skill.createdByUserId !== currentUserId) {
      throw new Error("无权限修改该 Skill 状态，仅创建者可操作");
    }
    const mapStatus = (item: SkillItem) =>
      item.id === skillId
        ? {
            ...item,
            status: (enabled ? "enabled" : "disabled") as SkillItem["status"],
            updatedAt: nowText(),
          }
        : item;
    const nextCustom = customSkills.map(mapStatus);
    const nextOfficial = officialSkills.map(mapStatus);
    return saveMergedSkillItems(data, nextCustom, nextOfficial, data.lastSkillSyncAt);
  },

  async syncSkillSnapshotManually(
    mode: SkillLeaderboardMode = "all",
  ): Promise<{ list: SkillItem[]; lastSyncAt: string; termsExtractedCount?: number }> {
    await delay(260);
    const data = loadDomainData();
    const { customSkills } = loadSkillBuckets(data);
    let officialSkills: SkillItem[] = [];
    let syncedAt = nowText();
    try {
      const endpoint = `${SKILLS_PROXY_SYNC_ENDPOINT}?mode=${encodeURIComponent(mode)}`;
      const proxyResult = await fetchSkillProxyList(endpoint, "POST");
      officialSkills = proxyResult.items;
      syncedAt = proxyResult.syncAt;
    } catch (error) {
      const message = extractErrorMessage(error);
      throw new Error(`手动同步失败：${message}`);
    }
    saveMergedSkillItems(data, customSkills, officialSkills, syncedAt);
    let termsExtractedCount = 0;
    for (const skill of officialSkills) {
      termsExtractedCount += await this.appendPendingGlossaryTermsFromSkill(skill);
    }
    return {
      list: toSkillList(officialSkills, customSkills, { mode }),
      lastSyncAt: syncedAt,
      termsExtractedCount: termsExtractedCount > 0 ? termsExtractedCount : undefined,
    };
  },

  async queryBusinessMetrics(payload: BusinessMetricQueryPayload): Promise<BusinessMetricQueryResult> {
    await delay(320);
    const data = loadDomainData();
    const question = payload.question?.toLowerCase() ?? "";
    const { customSkills, officialSkills } = loadSkillBuckets(data);
    const allSkills = dedupeSkillItems([...customSkills, ...officialSkills]);

    const inferMetricCodes = (): Array<BusinessMetricSnapshot["metricCode"]> => {
      if (payload.metricCode && payload.metricCode !== "all") {
        return [payload.metricCode];
      }
      const result: Array<BusinessMetricSnapshot["metricCode"]> = [];
      if (question.includes("营收") || question.includes("收入")) {
        result.push("revenue");
      }
      if (question.includes("arpu")) {
        result.push("arpu");
      }
      if (question.includes("活跃")) {
        result.push("activeUsers");
      }
      if (question.includes("投诉")) {
        result.push("ticketRate");
      }
      return result.length > 0 ? result : ["revenue", "arpu"];
    };

    const metricCodes = inferMetricCodes();
    const region = payload.region && payload.region !== "全部" ? payload.region : undefined;
    const period = payload.period && payload.period !== "全部" ? payload.period : undefined;

    let metrics = data.businessMetrics.filter((item) => metricCodes.includes(item.metricCode));
    if (region) {
      metrics = metrics.filter((item) => item.region === region);
    }
    if (period) {
      metrics = metrics.filter((item) => item.period === period);
    }
    if (metrics.length === 0) {
      metrics = data.businessMetrics.filter((item) => metricCodes.includes(item.metricCode)).slice(0, 3);
    }

    const skillIds = payload.skillIds ?? [];
    const appliedSkills = skillIds
      .map((id) => allSkills.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => ({ id: s!.id, name: s!.name }));
    const ruleTrace =
      appliedSkills.length > 0
        ? `本次问数受以下 Skill 约束：${appliedSkills.map((s) => s.name).join("、")}；意图与规则已按绑定 Skill 进行映射。`
        : undefined;

    if (payload.qaSessionId && skillIds.length > 0) {
      const bindRecords = data.qaSkillBindRecords ?? [];
      const rest = bindRecords.filter((r) => r.qaSessionId !== payload.qaSessionId);
      const newRecord: QaSkillBindRecord = {
        qaSessionId: payload.qaSessionId,
        skillIds,
        boundAt: nowText(),
      };
      saveDomainData({ ...data, qaSkillBindRecords: [...rest, newRecord] });
    }

    const firstValue = metrics[0]?.value ?? 0;
    const trend = [
      { period: "T-5", value: Number((firstValue * 0.88).toFixed(2)) },
      { period: "T-4", value: Number((firstValue * 0.93).toFixed(2)) },
      { period: "T-3", value: Number((firstValue * 0.96).toFixed(2)) },
      { period: "T-2", value: Number((firstValue * 1.01).toFixed(2)) },
      { period: "T-1", value: Number((firstValue * 0.98).toFixed(2)) },
      { period: "T", value: Number(firstValue.toFixed(2)) },
    ];

    const generatedSql = metrics
      .slice(0, 3)
      .map((item) => item.sqlTemplate.replace("${month}", "2026-03"))
      .join(";\n");

    return {
      resolvedIntent: question
        ? `识别到“${payload.question}”的核心意图：${metrics.map((item) => item.metricName).join("、")}分析`
        : "按筛选条件检索经营指标",
      resolvedMetricCodes: metricCodes,
      metrics,
      trend,
      generatedSql,
      explanation: "POC 逻辑：结合问题关键词与筛选条件进行指标匹配，输出结果卡片、趋势与 SQL 草案。",
      appliedSkills: appliedSkills.length > 0 ? appliedSkills : undefined,
      ruleTrace,
    };
  },

  async getQaSkillBindBySession(qaSessionId: string): Promise<QaSkillBindRecord | null> {
    await delay();
    const data = loadDomainData();
    const record = (data.qaSkillBindRecords ?? []).find((r) => r.qaSessionId === qaSessionId) ?? null;
    return record;
  },

  async saveQaSkillBindRecord(record: QaSkillBindRecord): Promise<void> {
    await delay();
    const data = loadDomainData();
    const bindRecords = data.qaSkillBindRecords ?? [];
    const rest = bindRecords.filter((r) => r.qaSessionId !== record.qaSessionId);
    saveDomainData({ ...data, qaSkillBindRecords: [...rest, record] });
  },

  async getOntologyLibraries(): Promise<OntologyLibrary[]> {
    await delay();
    const data = loadDomainData();
    return data.ontologyLibraries ?? [];
  },

  async createOntologyLibrary(payload: Pick<OntologyLibrary, "name" | "description" | "domain">): Promise<OntologyLibrary> {
    await delay();
    const data = loadDomainData();
    const now = nowText();
    const lib: OntologyLibrary = {
      id: createId("ol"),
      name: payload.name,
      description: payload.description,
      domain: payload.domain,
      createdAt: now,
      updatedAt: now,
      version: "1.0",
    };
    const next = [...(data.ontologyLibraries ?? []), lib];
    saveDomainData({ ...data, ontologyLibraries: next });
    return lib;
  },

  async updateOntologyLibrary(id: string, payload: Partial<Pick<OntologyLibrary, "name" | "description" | "domain" | "version">>): Promise<OntologyLibrary | null> {
    await delay();
    const data = loadDomainData();
    const libs = data.ontologyLibraries ?? [];
    const idx = libs.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    const updated = { ...libs[idx], ...payload, updatedAt: nowText() };
    const next = libs.map((l, i) => (i === idx ? updated : l));
    saveDomainData({ ...data, ontologyLibraries: next });
    return updated;
  },

  async deleteOntologyLibrary(id: string): Promise<boolean> {
    await delay();
    const data = loadDomainData();
    const libs = (data.ontologyLibraries ?? []).filter((l) => l.id !== id);
    const concepts = (data.ontologyConcepts ?? []).filter((c) => c.libraryId !== id);
    const relationTypes = (data.ontologyRelationTypes ?? []).filter((r) => r.libraryId !== id);
    const relations = (data.ontologyRelations ?? []).filter((r) => r.libraryId !== id);
    const conceptIds = new Set(concepts.map((c) => c.id));
    const properties = (data.ontologyProperties ?? []).filter((p) => conceptIds.has(p.conceptId));
    const mappings = (data.ontologyMappings ?? []).filter((m) => conceptIds.has(m.conceptId));
    saveDomainData({
      ...data,
      ontologyLibraries: libs,
      ontologyConcepts: concepts,
      ontologyProperties: properties,
      ontologyRelationTypes: relationTypes,
      ontologyRelations: relations,
      ontologyMappings: mappings,
    });
    return true;
  },

  async getOntologyConcepts(libraryId: string): Promise<OntologyConcept[]> {
    await delay();
    const data = loadDomainData();
    return (data.ontologyConcepts ?? []).filter((c) => c.libraryId === libraryId);
  },

  async createOntologyConcept(payload: Pick<OntologyConcept, "libraryId" | "name" | "parentId" | "description" | "sortOrder">): Promise<OntologyConcept> {
    await delay();
    const data = loadDomainData();
    const concept: OntologyConcept = {
      id: createId("oc"),
      libraryId: payload.libraryId,
      name: payload.name,
      parentId: payload.parentId,
      description: payload.description,
      sortOrder: payload.sortOrder,
    };
    const next = [...(data.ontologyConcepts ?? []), concept];
    saveDomainData({ ...data, ontologyConcepts: next });
    return concept;
  },

  async updateOntologyConcept(id: string, payload: Partial<Pick<OntologyConcept, "name" | "parentId" | "description" | "sortOrder">>): Promise<OntologyConcept | null> {
    await delay();
    const data = loadDomainData();
    const concepts = data.ontologyConcepts ?? [];
    const idx = concepts.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const updated = { ...concepts[idx], ...payload };
    const next = concepts.map((c, i) => (i === idx ? updated : c));
    saveDomainData({ ...data, ontologyConcepts: next });
    return updated;
  },

  async deleteOntologyConcept(id: string): Promise<boolean> {
    await delay();
    const data = loadDomainData();
    const concepts = (data.ontologyConcepts ?? []).filter((c) => c.id !== id);
    const properties = (data.ontologyProperties ?? []).filter((p) => p.conceptId !== id);
    const relations = (data.ontologyRelations ?? []).filter(
      (r) => r.sourceConceptId !== id && r.targetConceptId !== id,
    );
    const mappings = (data.ontologyMappings ?? []).filter((m) => m.conceptId !== id);
    saveDomainData({
      ...data,
      ontologyConcepts: concepts,
      ontologyProperties: properties,
      ontologyRelations: relations,
      ontologyMappings: mappings,
    });
    return true;
  },

  async getOntologyRelationTypes(libraryId: string): Promise<OntologyRelationType[]> {
    await delay();
    const data = loadDomainData();
    return (data.ontologyRelationTypes ?? []).filter((r) => r.libraryId === libraryId);
  },

  async createOntologyRelationType(payload: Pick<OntologyRelationType, "libraryId" | "name" | "direction">): Promise<OntologyRelationType> {
    await delay();
    const data = loadDomainData();
    const relType: OntologyRelationType = {
      id: createId("ort"),
      libraryId: payload.libraryId,
      name: payload.name,
      direction: payload.direction,
    };
    const next = [...(data.ontologyRelationTypes ?? []), relType];
    saveDomainData({ ...data, ontologyRelationTypes: next });
    return relType;
  },

  async getOntologyRelations(libraryId: string): Promise<OntologyRelation[]> {
    await delay();
    const data = loadDomainData();
    return (data.ontologyRelations ?? []).filter((r) => r.libraryId === libraryId);
  },

  async createOntologyRelation(payload: Pick<OntologyRelation, "libraryId" | "sourceConceptId" | "targetConceptId" | "relationType">): Promise<OntologyRelation> {
    await delay();
    const data = loadDomainData();
    const relation: OntologyRelation = {
      id: createId("orel"),
      libraryId: payload.libraryId,
      sourceConceptId: payload.sourceConceptId,
      targetConceptId: payload.targetConceptId,
      relationType: payload.relationType,
    };
    const next = [...(data.ontologyRelations ?? []), relation];
    saveDomainData({ ...data, ontologyRelations: next });
    return relation;
  },

  async getOntologyMappings(conceptId: string): Promise<OntologyMapping[]> {
    await delay();
    const data = loadDomainData();
    return (data.ontologyMappings ?? []).filter((m) => m.conceptId === conceptId);
  },

  async createOntologyMapping(payload: Pick<OntologyMapping, "conceptId" | "targetType" | "targetId">): Promise<OntologyMapping> {
    await delay();
    const data = loadDomainData();
    const mapping: OntologyMapping = {
      id: createId("om"),
      conceptId: payload.conceptId,
      targetType: payload.targetType,
      targetId: payload.targetId,
    };
    const next = [...(data.ontologyMappings ?? []), mapping];
    saveDomainData({ ...data, ontologyMappings: next });
    return mapping;
  },

  async getPermissionResources(
    systemId: string,
    category: PermissionCategory,
  ): Promise<PermissionResource[]> {
    await delay(100);
    const data = loadDomainData();
    const detail = data.knowledgeDetails[systemId];
    return detail ? detail.permissionResources[category] : [];
  },

  async getQuestionLabelingJobs(): Promise<QuestionLabelingJob[]> {
    await delay(80);
    const data = loadDomainData();
    return (data.questionLabelingJobs ?? []).slice().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  },

  async getQuestionLabelingJob(jobId: string): Promise<QuestionLabelingJob | null> {
    await delay(50);
    const data = loadDomainData();
    return (data.questionLabelingJobs ?? []).find((j) => j.id === jobId) ?? null;
  },

  async createQuestionLabelingJob(
    job: Omit<QuestionLabelingJob, "id" | "createdAt" | "updatedAt"> | QuestionLabelingJob,
  ): Promise<QuestionLabelingJob> {
    await delay(100);
    const data = loadDomainData();
    const list = data.questionLabelingJobs ?? [];
    const id = "id" in job && job.id ? job.id : `ql-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const full: QuestionLabelingJob = {
      ...job,
      id,
      rows: (job.rows ?? []).map((r, i) => ({
        ...r,
        id: r.id || `qlr-${id}-${i}`,
      })),
      createdAt: "createdAt" in job && job.createdAt ? job.createdAt : now,
      updatedAt: "updatedAt" in job && job.updatedAt ? job.updatedAt : now,
    };
    saveDomainData({ ...data, questionLabelingJobs: [...list, full] });
    return full;
  },

  async updateQuestionLabelingJobManualLabels(
    jobId: string,
    updates: Array<{ id: string; manualLabel?: string }>,
  ): Promise<void> {
    await delay(80);
    const data = loadDomainData();
    const list = data.questionLabelingJobs ?? [];
    const job = list.find((j) => j.id === jobId);
    if (!job) return;
    const byId = new Map(updates.map((u) => [u.id, u.manualLabel]));
    const nextRows = job.rows.map((r) =>
      byId.has(r.id) ? { ...r, manualLabel: byId.get(r.id) } : r,
    );
    const nextJob = { ...job, rows: nextRows, updatedAt: new Date().toISOString().slice(0, 19).replace("T", " ") };
    saveDomainData({
      ...data,
      questionLabelingJobs: list.map((j) => (j.id === jobId ? nextJob : j)),
    });
  },

  /** 全量更新任务（用于轮询拉取后台打标进度后写回本地） */
  async updateQuestionLabelingJob(jobId: string, job: QuestionLabelingJob): Promise<void> {
    await delay(50);
    const data = loadDomainData();
    const list = data.questionLabelingJobs ?? [];
    const index = list.findIndex((j) => j.id === jobId);
    if (index < 0) return;
    const next = list.slice();
    next[index] = { ...job, id: jobId, updatedAt: job.updatedAt ?? new Date().toISOString().slice(0, 19).replace("T", " ") };
    saveDomainData({ ...data, questionLabelingJobs: next });
  },

  async deleteQuestionLabelingJob(jobId: string): Promise<void> {
    await delay(80);
    const data = loadDomainData();
    const next = (data.questionLabelingJobs ?? []).filter((j) => j.id !== jobId);
    saveDomainData({ ...data, questionLabelingJobs: next });
  },
};
