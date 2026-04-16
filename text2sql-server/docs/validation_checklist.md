# 高级模式发布验证清单（Text2SQL）

本清单用于“仅高级模式生效”的上线与回归检查。

## 1. 功能验证（必须通过）

### 元数据抽取

- [ ] `python tools/meta_extractor.py --input <素材目录> --output ./meta` 可运行
- [ ] `meta/` 下生成（至少）：
  - [ ] `schema.md`
  - [ ] `metrics.md`
  - [ ] `code_tables.md`
  - [ ] `sample_sql.md`

### 需求解析

- [ ] `python tools/requirement_parser.py --input "<问句>" --no-llm` 输出结构化 JSON
- [ ] 账期/维度/排除条件能被解析到 `period_param/dimensions/filters.exclude`（若问句包含这些信息）

### SQL 校验与方言转换

- [ ] `python tools/sql_validator.py --sql <sql文件> --dialect hive` 能输出 valid/errors/warnings
- [ ] `python tools/dialect_converter.py --input <sql文件> --from hive --to maxcompute` 能输出转换结果

## 2. 业务验证（建议通过）

### 同问句绑定/不绑定 Skill

- [ ] 绑定 Skill 后返回包含 Skill 命中证据：`matched_skill_rule/matched_rule_names/fallback_reason`
- [ ] 不绑定 Skill 时，上述字段能解释“未命中/为何回退”
- [ ] SQL 或过滤条件存在**可解释差异**（如固定过滤、优先表、排除条件）

### 输出字段对齐（以需求文件为准）

- [ ] 需求列字段对照表顺序与名称一致
- [ ] 缺失口径按约定输出 `[待补充: ...]`，不编造

## 3. 稳定性验证（必须通过）

- [ ] 后端异常时前端不出现 JSON 解析崩溃（应提示“服务返回非 JSON/请检查后端日志”）
- [ ] LLM 调用失败时返回可读错误与 `fallback_reason`
- [ ] 上下文过长时能截断并在 warnings 说明（避免 token limit 直接失败）

