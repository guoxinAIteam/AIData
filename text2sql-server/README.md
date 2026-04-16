# Text2SQL Skill 工具链

本目录提供通用数仓智能取数能力（Skill + CLI + FastAPI），支持：
- 从素材自动构建元数据知识库
- 解析自然语言/需求文档为结构化意图
- 生成 SQL、校验 SQL、方言转换

## 目录结构

- `SKILL.md`：Skill 主入口
- `config.yaml`：全局配置
- `prompts/`：5 个 Prompt 模板
- `services/`：核心能力实现
- `tools/`：命令行工具入口（与规划一致）
- `examples/telecom/`：电信示例

## 安装依赖

```bash
pip install -r requirements.txt
```

## CLI 使用

```bash
# 初始化项目骨架
python tools/project_init.py --name telecom --dialect hive

# 元数据提取
python tools/meta_extractor.py --input ../s1.5\ -\ 副本\ \(2\)/ --output ./meta

# 解析需求
python tools/requirement_parser.py --input "分省新发展用户数"

# SQL 校验
python tools/sql_validator.py --sql ./output/query.sql --dialect hive --schema ./meta/schema.md

# 方言转换
python tools/dialect_converter.py --input ./output/query.sql --from hive --to maxcompute --output ./output/query_odps.sql
```

### Excel 素材说明（xlsx）

元数据提取支持从以下 Excel 文件中补齐知识库：

- 数据字典：文件名包含“数据字典”（输出到 `schema.md`）
- 指标口径知识库：文件名包含“指标口径”（输出到 `metrics.md`）

若 Excel 表头与预期不一致，提取器会尽量做“列名模糊匹配”，无法识别时将跳过该文件。

## FastAPI 启动

```bash
python -m uvicorn main:app --port 8100 --reload
```

## 电信示例

`examples/telecom/` 包含一个完整样例：
- `meta/`：schema / metrics / code_tables / sample_sql
- `requirements/`：2 个需求文档
- `output/`：示例输出文档
