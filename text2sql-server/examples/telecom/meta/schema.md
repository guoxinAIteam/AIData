# 数据字典 (schema)

## DWA_V_M_CUS_CB_USER_INFO
移网用户月度主表（来源：样例 SQL 与需求文档蒸馏）。

| 字段名 | 类型 | 含义 |
|--------|------|------|
| MONTH_ID | STRING | 统计账期，格式 YYYYMM |
| USER_ID | STRING | 用户标识，用于去重计数 |
| PROV_ID | STRING | 省份编码 |
| SERVICE_TYPE | STRING | 业务类型（移网常见前缀 40/50） |
| IS_IOT | STRING | 是否物联网（0 否 / 1 是） |
| IS_STAT | STRING | 是否纳入统计（1 是） |
| IS_INNET | STRING | 是否在网 |
| IS_THIS_DEV | STRING | 是否本期新发展 |
| PRODUCT_ID | STRING | 产品编码 |
| DEVELOP_CHANNEL_ID | STRING | 发展渠道编码 |

## DIM_PROV
省份码表。

| 字段名 | 类型 | 含义 |
|--------|------|------|
| PROV_ID | STRING | 省份编码 |
| PROV_DESC | STRING | 省份名称 |

## DIM_PRODUCT_WLW
物联网产品码表。

| 字段名 | 类型 | 含义 |
|--------|------|------|
| PRODUCT_ID | STRING | 产品编码 |

## DIM_PRODUCT_PRIVACY_NUMBER
隐私号产品码表。

| 字段名 | 类型 | 含义 |
|--------|------|------|
| PRODUCT_ID | STRING | 产品编码 |

## 表关联关系

| 关联表 | 别名 | JOIN 类型 | ON 条件 |
|--------|------|-----------|---------|
| DIM_PRODUCT_WLW | T2 | LEFT | A.PRODUCT_ID = T2.PRODUCT_ID |
| DIM_PRODUCT_PRIVACY_NUMBER | T3 | LEFT | A.PRODUCT_ID = T3.PRODUCT_ID |
| DIM_PROV | PROV | LEFT | A.PROV_ID = PROV.PROV_ID |
