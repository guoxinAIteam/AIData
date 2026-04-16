# 移网用户统计 - 输出说明

## 字段对照表

| 需求列名称 | 口径来源 | 关联字段/计算逻辑 |
|-----------|---------|-----------------|
| 统计账期 | 数据字典-DWA_V_M_CUS_CB_USER_INFO.MONTH_ID | 直接取值 |
| 省份名称 | 码表-DIM_PROV | LEFT JOIN DIM_PROV ON PROV_ID |
| 移网新发展用户数 | 指标口径库-新发展用户 | COUNT(DISTINCT USER_ID) WHERE IS_THIS_DEV='1' |
| 移网在网用户数 | 指标口径库-在网用户 | COUNT(DISTINCT USER_ID) WHERE IS_INNET='1' |
| 移网新发展在网用户数 | 指标口径库-复合条件 | COUNT(DISTINCT USER_ID) WHERE IS_THIS_DEV='1' AND IS_INNET='1' |
| 移网三无用户数 | 指标口径库-三无用户 | COUNT(DISTINCT USER_ID) WHERE USE_STATUS='0' |
| 移网活跃用户数 | 指标口径库-活跃用户 | COUNT(DISTINCT USER_ID) WHERE 语音/短信/流量任一有使用 |

## 执行说明

### 账期替换
SQL 中所有 `'202603'` 替换为实际账期（格式 YYYYMM）。

### 筛选条件
- 移网限定: `SUBSTR(SERVICE_TYPE,1,2) IN ('40','50')`
- 物联网排除: `IS_IOT = '0'`
- 统计用户: `IS_STAT = '1'`

### 结果校验
- 全国汇总用户数应与省分合计一致
- 各省用户数应在历史同期合理范围内（±20%）
