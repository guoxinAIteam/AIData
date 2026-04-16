# 语义知识平台（POC）

基于 `React 18 + TypeScript + Vite + Ant Design 5 + React Router v6 + Redux Toolkit` 实现的单页应用，聚焦语义知识运营场景，包含登录/注册/登出闭环、语义知识管理与知识库治理、术语与示例管理、操作日志、Skill 榜单与经营指标问数能力。

## 已实现模块

- 登录/注册页面（科技风），登录态持久化，未登录路由拦截，登出回登录页
- 三栏后台布局：左侧导航、顶部面包屑与全局操作、主内容区（系统名称统一为“语义知识平台”）
- 工作台：核心能力总览与快捷入口
- 语义知识库
  - 知识库列表卡片（搜索、创建、删除、进入管理）
  - 管理页 5 个标签：数据源、数据集、指标、维度、权限
  - 权限页支持新增授权弹窗（可选/已选列表）
- 业务术语词典
  - 列表筛选、状态开关、查看引用弹窗（含空状态）
  - 新增/编辑术语完整表单（含 `table.column`、JSON 校验）
- 示例问题库
  - 列表管理、状态切换、新增/编辑、执行弹窗
- 操作日志（原执行溯源中心）
  - 查询、筛选、重置、导出（CSV）
  - 评分仪表盘、成功率/耗时统计卡、趋势图、明细表
- Skill 榜单
  - 列表、搜索、筛选、详情查看、用户新增/编辑 Skill
  - **从文件导入 Skill**：支持 .md、.doc/.docx、**.xlsx/.xls**；Excel 导入时自动识别 4 个指定 Sheet（需求说明/需求说明及知识、知识、输出数据、输出 SQL），校验齐全后生成 Skill 草稿，可预览编辑后入库；与经营指标问数联动，可在问数前绑定使用。
  - 本地代理接口：`GET /api/skills/list`、`POST /api/skills/sync`、`GET /api/skills/detail`、`POST /api/skills/import/parse`（解析 MD/Word/Excel 返回草稿）
  - 手动同步（通过本地代理拉取 `https://skills.sh/` 榜单并刷新本地快照）
- 经营指标问数
  - 自然语言问数 + 条件筛选问数
  - **Excel 数据源**：支持固定路径重载与页面上传覆盖；解析「需求说明及知识」「输出数据」「输出 SQL」及 5 个关联表 Sheet，产出知识包与《Excel 内容标准化梳理文档》
  - **规则优先 NL2SQL**：问句命中规则时直接回放「输出数据」Sheet 结果并返回标准 SQL；未命中时走 Kimi 兜底
  - 结果卡片、趋势图、明细表（支持按输出规范动态列）、SQL 生成展示、规则命中/耗时标识
  - 问数接口：`POST /api/metrics/query`；Excel 相关：`POST /api/metrics/excel/reload`、`POST /api/metrics/excel/upload`、`GET /api/metrics/excel/profile`、`GET /api/metrics/excel/standardization-doc`（可选 `?download=1` 下载 Markdown）

## 运行方式

```bash
npm install
npm run dev
```

默认启动后访问：`http://localhost:5173`

> Skill 榜单依赖 Vite 开发服务内置代理，请使用 `npm run dev` 体验同步与详情抓取能力。

**经营指标问数（Kimi）**：需配置环境变量。将项目根目录下的 `.env.local.example` 复制为 `.env.local`，填写 `KIMI_API_KEY`（必填），可选 `KIMI_MODEL`、`KIMI_BASE_URL`。切勿将 `.env.local` 或真实 key 提交到仓库；未配置时问数接口返回 503。

**经营指标问数（Excel 数据源）**：固定路径由环境变量 `METRICS_EXCEL_PATH` 指定（未设置时使用默认路径）。在经营指标问数页可「重载」从该路径加载知识包，或「上传覆盖」上传本地 .xlsx 解析后覆盖。可预览/下载《Excel 内容标准化梳理文档》。验收目标：核心取数场景规则命中率 ≥90%，单次请求响应 ≤3 秒；取数结果与「输出数据」Sheet 列格式一致。验收示例问句：`分省新发展用户数`、`各省公众渠道新发展用户数（去除副卡）`。

### Text2SQL 高级引擎（可选）

经营指标问数页支持「高级模式」，启用后走 Text2SQL 5 阶段引擎（需求解析 → 逐列对齐 → 定核心表 → 码表转名 → SQL 生成），使用 FastAPI 后端服务：

```bash
# 终端 1：安装依赖并启动 FastAPI 后端
cd text2sql-server && pip install -r requirements.txt
python -m uvicorn main:app --port 8100 --reload

# 终端 2：启动 Vite 前端
npm run dev
```

Vite 开发服务器自动将 `/api/text2sql/*` 代理到 FastAPI `localhost:8100`。

**CLI 工具**（独立于 Web 平台使用）：

```bash
cd text2sql-server

# 初始化项目
python cli.py init --name my_project --dialect hive

# 从素材提取元数据
python cli.py extract-meta --input ./raw_materials/

# 校验 SQL
python cli.py validate --sql output.sql --dialect hive

# 方言转换
python cli.py convert --input output.sql --from hive --to maxcompute

# 查看元数据状态
python cli.py status
```

## 构建与检查

```bash
npm run build
npm run lint
```

## 默认测试账号

- 用户名：`zhaojinhui`
- 密码：`123456`

> 也可以直接在注册页创建新账号，账号信息与业务 Mock 数据都保存在浏览器 `localStorage` 中。

## 路由说明

- `/login` 登录页
- `/register` 注册页
- `/domain/workbench` 工作台
- `/domain/knowledge-systems` 语义知识库列表
- `/domain/knowledge-systems/:id/manage/:tab` 语义知识管理
- `/domain/example-questions` 示例问题库
- `/domain/glossary` 业务术语词典
- `/domain/glossary/new` 新增术语
- `/domain/glossary/:id/edit` 编辑术语
- `/domain/operation-logs` 操作日志
- `/domain/skills` Skill 榜单
- `/domain/metric-qa` 经营指标问数

兼容旧链接：

- `/domain/trace-center` 会自动重定向到 `/domain/operation-logs`

## 目录结构（核心）

- `src/layouts`：认证布局与后台布局
- `src/router`：路由定义与鉴权守卫
- `src/pages`：登录/注册及各业务页面
- `src/components`：通用组件与模块组件
- `src/services/mockApi.ts`：前端 Mock API（Promise + 延迟模拟）
- `src/mocks/db.ts`：种子数据
- `src/store`：Redux 状态管理
- `src/styles/theme.ts`：Ant Design 主题配置
