# Text2SQL 智能取数 Skill

## 触发条件
当用户提出以下意图时激活本 Skill：
- “取数” / “写 SQL” / “数据需求” / “text2sql”
- 提供自然语言问题，要求生成可执行 SQL
- 提供 Markdown 需求文档，要求结构化解析并生成 SQL

## 全局约束
- 所有结论必须基于 `meta/` 下知识文件（`schema.md`、`metrics.md`、`code_tables.md`、`sample_sql.md`）
- 禁止编造字段、表名、指标口径
- 缺失信息必须显式标注：`[待补充: ...]`
- 输出必须包含：字段对照表 + SQL + 执行说明
- 每个核心结论必须标注来源（格式：`依据：文件 X-XXX` 或 `依据：schema.md-表名/字段`）
- 若文件间存在冲突，优先以“需求文件（文件 5）”或你明确指定的优先级为准；无法裁决时需列出冲突点与各自依据

## 输出与交付格式（对齐文件 6 的要求）

- **字段对照表**：Markdown 表格（表头：`需求列名称|口径来源|关联字段/计算逻辑`）
- **SQL**：可执行 SQL（需要逐行注释，注明依据）
- **执行说明**：账期替换、筛选替换、结果校验建议
- **如需落地为文件**：
  - 脚本/数据输出均以 `txt` 为目标格式
  - 数据分隔符为 `|`
  - 文件超过 100MB 需要分包处理（如系统暂未支持分包，需在 warnings 明确提示）

## 5 阶段工作流

### 阶段 0：项目初始化（首次）
1. 运行 `python tools/project_init.py --name <项目名> --dialect hive`
2. 放入素材（DDL/样例SQL/码表/需求文档）到 `raw_materials/`
3. 运行 `python tools/meta_extractor.py --input ./raw_materials --output ./meta`

### 阶段 1：需求理解
- 输入：自然语言问题或 Markdown 需求文档
- 调用：`python tools/requirement_parser.py --input <文本或文件路径>`
- 输出：结构化意图（指标、维度、过滤、账期）

### 阶段 2：SQL 构建
- 检索 `schema.md` 定位来源表与字段
- 检索 `metrics.md` 获取指标定义
- 检索 `code_tables.md` 处理码值转名
- 参考 `sample_sql.md` 对齐 JOIN 与编码风格
- 生成 SQL 并为核心列/条件标注依据

### 阶段 3：校验
- 调用 `python tools/sql_validator.py --sql <sql文件> --dialect hive --schema ./meta/schema.md`
- 完成：语法校验 + Schema 一致性 + 风险语句检查

### 阶段 4：交付物组装
- 字段对照表（需求列名 | 口径来源 | 计算逻辑）
- 完整 SQL（含注释）
- 执行说明（账期替换、筛选替换、结果校验）

## Prompt 调度
- 元数据提取：`prompts/01_meta_extract.md`
- 需求解析：`prompts/02_requirement_parse.md`
- SQL 生成：`prompts/03_sql_generate.md`
- SQL 校验：`prompts/04_sql_validate.md`
- 方言转换：`prompts/05_dialect_convert.md`

## 常用命令
```bash
# 元数据提取
python tools/meta_extractor.py --input ./raw_materials --output ./meta

# 需求解析
python tools/requirement_parser.py --input "分省新发展用户数"

# SQL 校验
python tools/sql_validator.py --sql ./output/query.sql --dialect hive --schema ./meta/schema.md

# 方言转换
python tools/dialect_converter.py --input ./output/query.sql --from hive --to maxcompute --output ./output/query_odps.sql
```
