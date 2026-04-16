# 样例 SQL 库

以下为参考样例 SQL，可用于学习 JOIN 模式和编码风格。

```sql
# 样例sql
## 单移用户提取
-账期	省分	证件类型	是否三无	是否极低	是否出账	是否在网	是否校园市场	是否校园产品	是否物联网/隐私号/行短	单移用户
SELECT '202512' MONTH_ID,
       PROV.PROV_DESC,
       CASE
         WHEN SUBSTR(CERT_TYPE, 1, 2) = '01' THEN
          '个人'
         WHEN SUBSTR(CERT_TYPE, 1, 2) = '02' THEN
          '集团'
         ELSE
          '其他'
       END CERT_TYPE,
       CASE
         WHEN E.USE_STATUS = '0' THEN
          '是'
         ELSE
          '否'
       END IS_SW,
       CASE
         WHEN E.USE_STATUS <> '0' AND
              (E.CALL_DURATION <= 5 AND E.SMS_NUM <= 4 AND
              E.FLUX_UP + FLUX_DOWN <= 3) THEN
          '是'
         ELSE
          '否'
       END IS_JD,
       CASE
         WHEN A.IS_ACCT = '1' THEN
          '是'
         ELSE
          '否'
       END IS_ACCT,
       CASE
         WHEN A.IS_INNET = '1' THEN
          '是'
         ELSE
          '否'
       END IS_INNET,
       CASE
         WHEN T8.MARKET_SEGMENT = '1' THEN
          '是'
         ELSE
          '否'
       END IS_XYSC,
       CASE
         WHEN PRODUCT_NAME LIKE '%校园%' OR PRODUCT_NAME LIKE '%学校%' OR
              PRODUCT_NAME LIKE '%学院%' THEN
          '是'
         ELSE
          '否'
       END IS_XY,
       CASE
         WHEN T3.PRODUCT_ID IS NULL AND T2.PRODUCT_ID IS NULL AND
              (A.NET_TYPE_ID <> '65' OR
              A.BRAND_ID_CBSS NOT IN ('HCA1', 'HDA1')) --剔除行业短信（CB品牌65+网别HCA1、HDA1）
              AND SUBSTR(A.DEVICE_NUMBER, 1, 4) NOT IN ('1455') AND
              SUBSTR(A.DEVICE_NUMBER, 1, 3) NOT IN ('146') AND
              A.IS_IOT = '0' AND
              SUBSTR(A.DEVICE_NUMBER, 1, 4) NOT IN ('1454', '1457') THEN
          '否'
         ELSE
          '是'
       END IS_TC,
       COUNT(*) DY_NUM
  FROM (SELECT *
          FROM DWA.DWA_V_M_CUS_CB_USER_INFO A
         WHERE MONTH_ID = '202512'
           AND SUBSTR(A.SERVICE_TYPE, 1, 4) IN ('40AA', '50AA')
           AND IS_IOT = '0'
           AND IS_STAT = '1') A
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ITSY_CUBE.DIM_PRODUCT_WLW --ZBG_DIM.DIM_PRODUCT_WLW--物联网产品码表--一致
              GROUP BY PRODUCT_ID) T2
    ON A.PRODUCT_ID = T2.PRODUCT_ID
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ZQ_DIM.DIM_PRODUCT_PRIVACY_NUMBER --ZBG_DIM.DIM_PRODUCT_PRIVACY_NUMBER
              WHERE DATA_SOURCE_DESC <> 'BSS'
              GROUP BY PRODUCT_ID) T3
    ON A.PRODUCT_ID = T3.PRODUCT_ID
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM A
              WHERE A.MONTH_ID = '202512'
                AND A.IS_USER_VALID = '1'
                AND A.IS_COMP_VALID = '1'
                AND A.USER_RN_TYPE = '1') B
    ON A.USER_ID = B.USER_ID
  LEFT JOIN (SELECT *
               FROM DWD.DWD_M_PRD_CB_PRODUCT
              WHERE MONTH_ID = '202512') C
    ON A.PRODUCT_ID = C.PRODUCT_ID
  LEFT JOIN (SELECT PROV_ID, CUST_ID, CERT_TYPE
               FROM ZB_MG_TM.DWA_V_D_CUS_CB_RNS_NEW
              WHERE MONTH_ID = '202512'
                AND DAY_ID = '31'
              GROUP BY PROV_ID, CUST_ID, CERT_TYPE) D
    ON A.CUST_ID = D.CUST_ID
   AND A.PROV_ID = D.PROV_ID
  LEFT JOIN (SELECT *
               FROM DWA.DWA_V_M_CUS_CB_SING_USE
              WHERE MONTH_ID = '202512') E
    ON A.USER_ID = E.USER_ID
  LEFT JOIN DIM_PROV PROV
    ON A.PROV_ID = PROV.PROV_ID
  LEFT JOIN (SELECT PROV_ID,
                    CHNL_ID, --渠道ID
                    CHNL_KIND_ID, --渠道类型ID
                    MARKET_SEGMENT --细分市场
               FROM DWD.DWD_M_MRT_AL_CHL_CHANNEL --渠道信息
              WHERE MONTH_ID = '202512') T8
    ON A.DEVELOP_CHANNEL_ID = T8.CHNL_ID
   AND A.PROV_ID = T8.PROV_ID
 WHERE B.USER_ID IS NULL
 GROUP BY PROV.PROV_DESC,
          CASE
            WHEN SUBSTR(CERT_TYPE, 1, 2) = '01' THEN
             '个人'
            WHEN SUBSTR(CERT_TYPE, 1, 2) = '02' THEN
             '集团'
            ELSE
             '其他'
          END,
          CASE
            WHEN E.USE_STATUS = '0' THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN E.USE_STATUS <> '0' AND
                 (E.CALL_DURATION <= 5 AND E.SMS_NUM <= 4 AND
                 E.FLUX_UP + FLUX_DOWN <= 3) THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN A.IS_ACCT = '1' THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN A.IS_INNET = '1' THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN T8.MARKET_SEGMENT = '1' THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN PRODUCT_NAME LIKE '%校园%' OR PRODUCT_NAME LIKE '%学校%' OR
                 PRODUCT_NAME LIKE '%学院%' THEN
             '是'
            ELSE
             '否'
          END,
          CASE
            WHEN T3.PRODUCT_ID IS NULL AND T2.PRODUCT_ID IS NULL AND
                 (A.NET_TYPE_ID <> '65' OR
                 A.BRAND_ID_CBSS NOT IN ('HCA1', 'HDA1')) --剔除行业短信（CB品牌65+网别HCA1、HDA1）
                 AND SUBSTR(A.DEVICE_NUMBER, 1, 4) NOT IN ('1455') AND
                 SUBSTR(A.DEVICE_NUMBER, 1, 3) NOT IN ('146') AND
                 A.IS_IOT = '0' AND
                 SUBSTR(A.DEVICE_NUMBER, 1, 4) NOT IN ('1454', '1457') THEN
             '否'
            ELSE
             '是'
          END
## 宽移融合月报基础
SELECT '${V_MONTH}' MONTH_ID1,
       T.PROV_ID,
       PROV.PROV_DESC,
       T.COMP_ID,
       T1.LEVEL_3,
       T1.LEVEL_GK,
       T1.MARKET_SEGMENT, -- 细分市场
       T1.IS_ZX,
       T1.IS_ZHWQ,
       CASE
         WHEN IS_ADD_COMP = '1' AND
              SUBSTR(KD_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') AND
              SUBSTR(YW_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') THEN
          '2'
         WHEN IS_ADD_COMP = '1' AND
              SUBSTR(KD_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') THEN
          '3'
         WHEN IS_ADD_COMP = '1' AND
              SUBSTR(YW_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') THEN
          '4'
         WHEN IS_ADD_COMP = '1' THEN
          '5'
         WHEN NVL(IS_ADD_COMP, '0') = '0' AND
              SUBSTR(KD_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') AND
              SUBSTR(KD_MAX_START_DATE, 1, 6) = '${V_MONTH}' THEN
          '6'
         WHEN NVL(IS_ADD_COMP, '0') = '0' AND
              SUBSTR(YW_MAX_INNET_DATE, 1, 6) IN
              (DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),
                           'yyyyMM'),
               '${V_MONTH}') AND
              SUBSTR(YW_MAX_START_DATE, 1, 6) = '${V_MONTH}' THEN
          '7'
         WHEN NVL(IS_ADD_COMP, '0') = '0' AND
              (SUBSTR(YW_MAX_START_DATE, 1, 6) = '${V_MONTH}' OR
               SUBSTR(KD_MAX_START_DATE, 1, 6) = '${V_MONTH}') THEN
          '8'
         ELSE
          '9'
       END RH_TYPE,
       CASE
         WHEN COMP_YW_NUM = 1 AND COMP_KD_NUM = 1 THEN
          1
         ELSE
          0
       END Y1K1_COMP_NUM, ----1宽1移群组数
       CASE
         WHEN COMP_YW_NUM > 1 AND COMP_KD_NUM = 1 THEN
          1
         ELSE
          0
       END YNK1_COMP_NUM, ----1宽N移群组数
       CASE
         WHEN COMP_YW_NUM > 1 AND COMP_KD_NUM = 2 THEN
          1
         ELSE
          0
       END YNK2_COMP_NUM, ----2宽N移群组数
       CASE
         WHEN COMP_YW_NUM > 1 AND COMP_KD_NUM > 2 THEN
          1
         ELSE
          0
       END YNKN_COMP_NUM, ----N宽N移群组数
       NVL(T1.COMP_TOTAL_FEE, '0') COMP_TOTAL_FEE, ---群组出账收入
       NVL(T1.COMP_DEAL_AMOUNT, '0') COMP_DEAL_AMOUNT, ---群组电子券收入
       NVL(T1.COMP_FEE, '0') COMP_FEE, ---群组实收：出账收入-电子券收入
       NVL(T1.ARPU_L3, '0') ARPU_L3, ---拍照账期生效前三个月平均出账收入
       NVL(T1.YW_NUM, '0') YW_NUM, ---群组中在网移网成员数
       NVL(T1.KD_NUM, '0') KD_NUM ---群组中在网宽带成员数 
  FROM (SELECT PROV_ID, COMP_ID
          FROM DWA.DWA_V_M_CUS_CB_OM_DATUM T
         WHERE MONTH_ID = '${V_MONTH}'
           AND BIND_TYPE = '1'
           AND IS_USER_VALID = '1'
           AND IS_COMP_VALID = '1'
           AND USER_RN_TYPE = '1'
         GROUP BY PROV_ID, COMP_ID) T ---对于跨域的群组，
  LEFT JOIN (SELECT A.COMP_ID,
                    -------群组类型
                    MAX(CASE
                          WHEN A.COMP_TYPE = '97' THEN
                           '1'
                          ELSE
                           '0'
                        END) IS_ZHWQ, ---政企类融合，人多，出账高
                    MAX(CASE
                          WHEN B.COMP_ID IS NOT NULL THEN
                           '1'
                          ELSE
                           '0'
                        END) IS_ADD_COMP,
                    MAX(IS_ZX) IS_ZX,
                    MAX(CASE
                          WHEN SUBSTR(A.SERVICE_TYPE, 1, 4) IN ('0401', '0403') THEN
                           A.INNET_DATE
                        END) KD_MAX_INNET_DATE,
                    MAX(CASE
                          WHEN SUBSTR(A.SERVICE_TYPE, 1, 4) IN ('40AA', '50AA') THEN
                           A.INNET_DATE
                        END) YW_MAX_INNET_DATE,
                    MAX(CASE
                          WHEN SUBSTR(A.SERVICE_TYPE, 1, 4) IN ('0401', '0403') THEN
                           A.START_DATE
                        END) KD_MAX_START_DATE,
                    MAX(CASE
                          WHEN SUBSTR(A.SERVICE_TYPE, 1, 4) IN ('40AA', '50AA') THEN
                           A.START_DATE
                        END) YW_MAX_START_DATE,
                    ------发展渠道类型编码(三级渠道)
                    MAX(CASE
                          WHEN RN = '1' AND T3.MARKET_SEGMENT = '1' THEN
                           '01' -- 校园(市场)
                          WHEN RN = '1' AND T3.MARKET_SEGMENT = '2' THEN
                           '02' -- 农村(市场)
                          WHEN RN = '1' AND
                               (T3.MARKET_SEGMENT = '3' OR
                               (T9.DEV_CODE IS NOT NULL AND
                               T3.MARKET_SEGMENT NOT IN ('1', '2', '3'))) THEN
                           '03' -- 聚类(市场)
                          WHEN RN = '1' AND T3.MARKET_SEGMENT = '4' AND
                               T9.DEV_CODE IS NULL THEN
                           '04' -- 社区(市场)
                          WHEN RN = '1' AND T3.MARKET_SEGMENT = '5' AND
                               T9.DEV_CODE IS NULL THEN
                           '05' -- 线上(市场)
                          WHEN RN = '1' AND T3.MARKET_SEGMENT = '6' AND
                               T9.DEV_CODE IS NULL THEN
                           '06' -- 政企(市场)
                          WHEN RN = '1' THEN
                           '99' -- 其他
                        END) MARKET_SEGMENT, -- 细分市场
                    MAX(CASE
                          WHEN RN = '1' THEN
                           QDXX.LEVEL_3
                        END) LEVEL_3,
                    MAX(CASE
                          WHEN RN = '1' THEN
                           QDXX.LEVEL_3_CODE
                        END) LEVEL_3_CODE,
                    MAX(CASE
                          WHEN RN = '1' THEN
                           LEVEL_GK
                        END) LEVEL_GK,
                    MAX(CASE
                          WHEN RN = '1' THEN
                           C.DEVELOP_CHANNEL_ID
                        END) DEVELOP_CHANNEL_ID,
                    SUM(CASE
                          WHEN A.USER_TYPE = 'YW' THEN
                           1
                          ELSE
                           0
                        END) COMP_YW_NUM,
                    SUM(CASE
                          WHEN A.USER_TYPE = 'KD' THEN
                           1
                          ELSE
                           0
                        END) COMP_KD_NUM,
                    SUM(TOTAL_FEE_L1 + TOTAL_FEE_L2 + TOTAL_FEE_L3) / 3 ARPU_L3,
                    SUM(NVL(F.TOTAL_FEE, 0) - NVL(H.DEAL_AMOUNT, 0)) COMP_FEE,
                    SUM(F.TOTAL_FEE) COMP_TOTAL_FEE,
                    SUM(DEAL_AMOUNT) COMP_DEAL_AMOUNT,
                    SUM(CASE
                          WHEN A.USER_TYPE = 'YW' AND C.IS_INNET = '1' THEN
                           1
                          ELSE
                           0
                        END) YW_NUM,
                    SUM(CASE
                          WHEN A.USER_TYPE = 'KD' AND C.IS_INNET = '1' THEN
                           1
                          ELSE
                           0
                        END) KD_NUM,
                    SUM(CASE
                          WHEN A.USER_TYPE = 'GH' AND C.IS_INNET = '1' THEN
                           1
                          ELSE
                           0
                        END) GH_NUM
               FROM (SELECT T.*,
                            CASE
                              WHEN SUBSTR(SERVICE_TYPE, 1, 4) IN
                                   ('0401', '0403') THEN
                               'KD'
                              WHEN SUBSTR(SERVICE_TYPE, 1, 4) IN
                                   ('40AA', '50AA') THEN
                               'YW'
                              WHEN SUBSTR(SERVICE_TYPE, 1, 2) IN ('01') AND
                                   SERVICE_TYPE NOT IN ('0105AAAA') THEN
                               'GH'
                              ELSE
                               'QT'
                            END USER_TYPE,
                            CASE
                              WHEN SERVICE_TYPE IN
                                   ('04010102',
                                    '04010112',
                                    '04010122',
                                    '04010202',
                                    '0403AAAA') THEN
                               '1'
                              ELSE
                               '0'
                            END IS_ZX,
                            ROW_NUMBER() OVER(PARTITION BY COMP_ID ORDER BY START_DATE DESC,CASE
                              WHEN SUBSTR(SERVICE_TYPE,
                                          1,
                                          4) IN
                                   ('0401',
                                    '0403') THEN
                               '9'
                              WHEN SUBSTR(SERVICE_TYPE,
                                          1,
                                          4) IN
                                   ('40AA',
                                    '50AA') THEN
                               '8'
                              ELSE
                               '7'
                            END DESC) RN ---渠道取用户的
                       FROM DWA.DWA_V_M_CUS_CB_OM_DATUM T
                      WHERE MONTH_ID = '${V_MONTH}'
                        AND BIND_TYPE = '1'
                        AND IS_USER_VALID = '1'
                        AND IS_COMP_VALID = '1') A
               LEFT JOIN (SELECT COMP_ID
                           FROM DWA.DWA_V_M_CUS_CB_OM_FLAG_GRP
                          WHERE MONTH_ID = '${V_MONTH}'
                            AND BIND_TYPE = '1'
                            AND LOST_ADD_FLAG = '1'
                            AND IF_USER_VALID = '1'
                            AND IF_COMP_VALID = '1'
                          GROUP BY COMP_ID) B --打标新增
                 ON A.COMP_ID = B.COMP_ID
               LEFT JOIN (SELECT *
                           FROM DWA.DWA_V_M_CUS_CB_USER_INFO
                          WHERE MONTH_ID = '${V_MONTH}'
                            AND IS_STAT = '1') C
                 ON A.USER_ID = C.USER_ID
               LEFT JOIN (SELECT USER_ID,
                                SUM(CASE
                                      WHEN MONTH_ID =
                                           DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}',
                                                                          'yyyyMM'),
                                                                  -3),
                                                       'yyyyMM') THEN
                                       TOTAL_FEE
                                      ELSE
                                       0
                                    END) TOTAL_FEE_L3,
                                SUM(CASE
                                      WHEN MONTH_ID =
                                           DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}',
                                                                          'yyyyMM'),
                                                                  -2),
                                                       'yyyyMM') THEN
                                       TOTAL_FEE
                                      ELSE
                                       0
                                    END) TOTAL_FEE_L2,
                                SUM(CASE
                                      WHEN MONTH_ID =
                                           DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}',
                                                                          'yyyyMM'),
                                                                  -1),
                                                       'yyyyMM') THEN
                                       TOTAL_FEE
                                      ELSE
                                       0
                                    END) TOTAL_FEE_L1,
                                SUM(CASE
                                      WHEN MONTH_ID = '${V_MONTH}' THEN
                                       TOTAL_FEE
                                      ELSE
                                       0
                                    END) TOTAL_FEE
                           FROM DWA.DWA_V_M_CUS_CB_SING_CHARGE
                          WHERE MONTH_ID BETWEEN
                                DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}',
                                                               'yyyyMM'),
                                                       -3),
                                            'yyyyMM') AND '${V_MONTH}'
                          GROUP BY USER_ID) F
                 ON A.USER_ID = F.USER_ID
               LEFT JOIN (SELECT USER_TEL_NO DEVICE_NUMBER,
                                SUM(CAST(NVL(A.DEAL_AMOUNT, 0) AS DOUBLE) / 100) DEAL_AMOUNT ---电子券金额
                           FROM (SELECT USER_TEL_NO,
                                        INVESTOR_CODE, --出资方编号
                                        DEAL_AMOUNT
                                   FROM ZQ_DWD.DWD_M_RES_ZF_COUPON_DEAL
                                  WHERE MONTH_ID = '${V_MONTH}'
                                    AND DEAL_TYPE = '1' --交易类型,选择发券（消费）的
                                    AND DEAL_STATE = 'S' --交易状态,选择成功的
                                  GROUP BY USER_TEL_NO,
                                           INVESTOR_CODE,
                                           DEAL_AMOUNT) A
                          INNER JOIN ZB_SERV_CTH.DIM_SC_DZQ_JSCZF C
                             ON A.INVESTOR_CODE = C.ISS_ID
                          GROUP BY USER_TEL_NO) H
                 ON A.DEVICE_NUMBER = H.DEVICE_NUMBER
               LEFT JOIN (SELECT *
                           FROM DWD.DWD_M_MRT_AL_CHL_CHANNEL
                          WHERE MONTH_ID = '${V_MONTH}') T3
                 ON C.DEVELOP_CHANNEL_ID = T3.CHNL_ID
                AND C.PROV_ID = T3.PROV_ID
               LEFT JOIN (SELECT DEV_CODE --发展人编
                           FROM ZB_MG_TM.DWD_M_MRT_AL_CHL_DEVELOPER --渠道发展人信息表
                          WHERE MONTH_ID = '${V_MONTH}'
                            AND FUNC_SINGLE_VALUE IS NOT NULL) T9
                 ON C.DEVELOP_STAFF_ID = T9.DEV_CODE
               LEFT JOIN DIM_QDXX QDXX
                 ON T3.CHNL_KIND_ID = QDXX.LEVEL_3
               LEFT JOIN DIM_DK_QD DIM_DK_QD
                 ON QDXX.LEVEL_3 = DIM_DK_QD.LEVEL_3
              GROUP BY A.COMP_ID) T1 ---本月融合用户以群组汇总的相关信息和打标
    ON T.COMP_ID = T1.COMP_ID
  LEFT JOIN DIM_PROV PROV
    ON T.PROV_ID = PROV.PROV_ID
## 移宽用户单用户打标
SELECT A.MONTH_ID,
       A.PROV_ID,
       A.USER_ID,
       A.IS_ACCT,
       A.IS_INNET,
       A.IS_THIS_DEV,
       CASE WHEN B.USER_ID IS NOT NULL THEN '1' ELSE '0' END IS_RH,
       CASE WHEN B1.USER_ID IS NOT NULL THEN '1' ELSE '0' END IS_RH_L,
       CASE WHEN SUBSTR(SERVICE_TYPE, 1, 4) IN ('0401', '0403') THEN 'KD' ELSE 'YW' END USER_TYPE,
       CASE WHEN A.NET_TYPE_ID = '65' AND A.BRAND_ID_CBSS IN ('HCA1', 'HDA1') THEN '行短'
            WHEN T3.PRODUCT_ID IS NOT NULL THEN '隐私号'
            WHEN T2.PRODUCT_ID IS NOT NULL OR SUBSTR(A.DEVICE_NUMBER, 1, 4) IN ('1455','1454', '1457') OR SUBSTR(A.DEVICE_NUMBER, 1, 3) IN ('146') 
                 THEN '物联网' 
            WHEN FK.USER_ID IS NOT NULL THEN '副卡' ELSE '主套餐' END YW_PRODUCT_TYPE,
       CASE WHEN A.SERVICE_TYPE IN ('04010102','04010112','04010122','04010202','0403AAAA') THEN '1' ELSE '0' END IS_ZX,
       C.SPEED_VALUE,
       D.TOTAL_FEE,
       PRODUCT_B.RSRV_VALUE2
  FROM (SELECT *
          FROM DWA.DWA_V_M_CUS_CB_USER_INFO
         WHERE MONTH_ID = '${V_MONTH}'
           AND IS_STAT = '1'
           AND (SUBSTR(SERVICE_TYPE, 1, 4) IN ('0401', '0403')
            OR (IS_IOT = '0' AND SUBSTR(SERVICE_TYPE, 1, 2) IN ('40', '50')))) A
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM T
              WHERE MONTH_ID = '${V_MONTH}'
                AND IS_USER_VALID = '1'
                AND IS_COMP_VALID = '1'
              GROUP BY USER_ID) B ---本月融合
    ON A.USER_ID = B.USER_ID
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM T
              WHERE MONTH_ID =
                    DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'),
                                           +1),
                                'yyyyMM')
                AND IS_USER_VALID = '1'
                AND IS_COMP_VALID = '1'
              GROUP BY USER_ID) B1 ---次月融合
    ON A.USER_ID = B1.USER_ID
  LEFT JOIN (SELECT USER_ID, MAX(SPEED_VALUE) SPEED_VALUE
               FROM (SELECT USER_ID,
                            CAST(REGEXP_REPLACE(ATTR_VALUE, '(\D+)', '') AS
                                 DOUBLE) AS SPEED_VALUE
                       FROM DWD.DWD_M_PRD_CB_USER_ITEM
                      WHERE ATTR_CODE = 'REL_SPEED'
                        AND SUBSTR(START_DATE, 1, 6) <= '${V_MONTH}'
                        AND SUBSTR(END_DATE, 1, 6) >= '${V_MONTH}'
                        AND MONTH_ID = '${V_MONTH}'
                      GROUP BY USER_ID,
                               CAST(REGEXP_REPLACE(ATTR_VALUE, '(\D+)', '') AS
                                    DOUBLE)
                     UNION ALL
                     SELECT USER_ID, NVL(SPEED_VALUE, 0)
                       FROM DWA.DWA_V_M_CUS_CB_TRUE_SPEED
                      WHERE MONTH_ID = '${V_MONTH}'
                      GROUP BY USER_ID, NVL(SPEED_VALUE, 0))
              GROUP BY USER_ID) C --速率
    ON A.USER_ID = C.USER_ID
  LEFT JOIN (SELECT USER_ID,TOTAL_FEE
               FROM DWA.DWA_V_M_CUS_CB_SING_CHARGE
              WHERE MONTH_ID = '${V_MONTH}') D
    ON A.USER_ID = D.USER_ID ---出账
  LEFT JOIN (SELECT *
               FROM DWD.DWD_D_PRD_CB_PRODUCT
              WHERE MONTH_ID = '202410'
                AND DAY_ID = '03') PRODUCT_B ---RSRV_VALUE2套餐费用
    ON A.PRODUCT_ID = PRODUCT_B.PRODUCT_ID
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ITSY_CUBE.DIM_PRODUCT_WLW --ZBG_DIM.DIM_PRODUCT_WLW--物联网产品码表--一致
              GROUP BY PRODUCT_ID) T2
    ON A.PRODUCT_ID = T2.PRODUCT_ID
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ZQ_DIM.DIM_PRODUCT_PRIVACY_NUMBER --ZBG_DIM.DIM_PRODUCT_PRIVACY_NUMBER
              WHERE DATA_SOURCE_DESC <> 'BSS'
              GROUP BY PRODUCT_ID) T3
    ON A.PRODUCT_ID = T3.PRODUCT_ID
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM A
              WHERE A.MONTH_ID = '${V_MONTH}'
                AND A.IS_USER_VALID = '1'
                AND BIND_TYPE = '3'
                AND COMP_ID <> USER_ID
                AND A.IS_COMP_VALID = '1'
				group by USER_ID) FK
    ON A.USER_ID = FK.USER_ID
## 流失离网基础
SELECT '${V_MONTH}' MONTH_ID,
       PROV.PROV_DESC,
       CASE WHEN B.NET_TYPE_ID = '65' AND B.BRAND_ID_CBSS IN ('HCA1', 'HDA1') THEN '行短'
            WHEN T3.PRODUCT_ID IS NOT NULL THEN '隐私号'
            WHEN T2.PRODUCT_ID IS NOT NULL OR SUBSTR(B.DEVICE_NUMBER, 1, 4) IN ('1455','1454', '1457') OR SUBSTR(B.DEVICE_NUMBER, 1, 3) IN ('146') 
                 THEN '物联网' 
            WHEN FK.USER_ID IS NOT NULL THEN '副卡' ELSE '主套餐' END YW_PRODUCT_TYPE,
       CASE WHEN rsrv_value2 >= 0 AND rsrv_value2 < 29 THEN '[0-29)元（不含29元）'
            WHEN rsrv_value2 >= 29 AND rsrv_value2 < 49 THEN '[29-49)元（不含49元）'
            WHEN rsrv_value2 >= 49 AND rsrv_value2 < 79 THEN '[49-79)元（不含79元）'
            WHEN rsrv_value2 >= 79 AND rsrv_value2 < 99 THEN '[79-99)元（不含99元）'
            WHEN rsrv_value2 >= 99 AND rsrv_value2 < 129 THEN '[99-129)元（不含129元）'
            WHEN rsrv_value2 = 999 THEN '999元'
            WHEN rsrv_value2 >= 129 THEN '129元及以上（含129，不含999）' ELSE '其他' END rsrv_value2,
       CASE WHEN C.USER_ID IS NOT NULL THEN '是' ELSE '否' END IS_RH,
       COUNT(*) LS_NUM FROM
(SELECT *
  FROM DWA.DWA_V_M_CUS_CB_USER_INFO
 WHERE MONTH_ID = '${V_MONTH}'
   AND IS_STAT = '1'
   AND IS_IOT = '0'
   AND IS_ACCT = '0'
   AND SUBSTR(SERVICE_TYPE, 1, 2) IN ('40', '50')) A
INNER JOIN
(SELECT *
  FROM DWA.DWA_V_M_CUS_CB_USER_INFO
 WHERE MONTH_ID = DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1), 'yyyyMM')
   AND IS_STAT = '1'
   AND IS_IOT = '0'
   AND IS_ACCT = '1'
   AND SUBSTR(SERVICE_TYPE, 1, 2) IN ('40', '50')) B ON A.USER_ID = B.USER_ID
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM T
              WHERE MONTH_ID =
                    DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),'yyyyMM')
                AND IS_USER_VALID = '1'
                AND IS_COMP_VALID = '1'
                AND BIND_TYPE = '1'
              GROUP BY USER_ID) C ON B.USER_ID = C.USER_ID
  LEFT JOIN (SELECT *
               FROM DWD.DWD_D_PRD_CB_PRODUCT
              WHERE MONTH_ID = '202411'
                AND DAY_ID = '03') PRODUCT_B ---RSRV_VALUE2套餐费用
    ON B.PRODUCT_ID = PRODUCT_B.PRODUCT_ID
 LEFT JOIN DIM_PROV PROV ON A.PROV_ID = PROV.PROV_ID
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ITSY_CUBE.DIM_PRODUCT_WLW --ZBG_DIM.DIM_PRODUCT_WLW--物联网产品码表--一致
              GROUP BY PRODUCT_ID) T2
    ON B.PRODUCT_ID = T2.PRODUCT_ID
  LEFT JOIN (SELECT PRODUCT_ID
               FROM ZQ_DIM.DIM_PRODUCT_PRIVACY_NUMBER --ZBG_DIM.DIM_PRODUCT_PRIVACY_NUMBER
              WHERE DATA_SOURCE_DESC <> 'BSS'
              GROUP BY PRODUCT_ID) T3
    ON B.PRODUCT_ID = T3.PRODUCT_ID
  LEFT JOIN (SELECT USER_ID
               FROM DWA.DWA_V_M_CUS_CB_OM_DATUM A
              WHERE A.MONTH_ID = DATE_FORMAT(ADD_MONTHS(TO_DATE('${V_MONTH}', 'yyyyMM'), -1),'yyyyMM')
                AND A.IS_USER_VALID = '1'
                AND BIND_TYPE = '3'
                AND COMP_ID <> USER_ID
                AND A.IS_COMP_VALID = '1'
                GROUP BY USER_ID) FK
    ON B.USER_ID = FK.USER_ID
GROUP BY PROV.PROV_DESC,
       CASE WHEN B.NET_TYPE_ID = '65' AND B.BRAND_ID_CBSS IN ('HCA1', 'HDA1') THEN '行短'
            WHEN T3.PRODUCT_ID IS NOT NULL THEN '隐私号'
            WHEN T2.PRODUCT_ID IS NOT NULL OR SUBSTR(B.DEVICE_NUMBER, 1, 4) IN ('1455','1454', '1457') OR SUBSTR(B.DEVICE_NUMBER, 1, 3) IN ('146') 
                 THEN '物联网' 
            WHEN FK.USER_ID IS NOT NULL THEN '副卡' ELSE '主套餐' END ,
       CASE WHEN rsrv_value2 >= 0 AND rsrv_value2 < 29 THEN '[0-29)元（不含29元）'
            WHEN rsrv_value2 >= 29 AND rsrv_value2 < 49 THEN '[29-49)元（不含49元）'
            WHEN rsrv_value2 >= 49 AND rsrv_value2 < 79 THEN '[49-79)元（不含79元）'
            WHEN rsrv_value2 >= 79 AND rsrv_value2 < 99 THEN '[79-99)元（不含99元）'
            WHEN rsrv_value2 >= 99 AND rsrv_value2 < 129 THEN '[99-129)元（不含129元）'
            WHEN rsrv_value2 = 999 THEN '999元'
            WHEN rsrv_value2 >= 129 THEN '129元及以上（含129，不含999）' ELSE '其他' END ,
       CASE WHEN C.USER_ID IS NOT NULL THEN '是' ELSE '否' END
```
