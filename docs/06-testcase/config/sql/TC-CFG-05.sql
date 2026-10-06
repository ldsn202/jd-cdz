-- TC-CFG-05.sql 修改含义后旧试转换失效（用旧 trialId 启用被拒）
-- 场景：模拟 TC-CFG-04 保存后的状态——cfg-01 当前候选推进到 cfgv-01-3（无 PASSED 试转换），
--       旧试转换 ct-01-2 属于旧候选 cfgv-01-2。
-- ========== 数据准备 ==========

INSERT OR REPLACE INTO integration_config_version
  (id, integration_config_id, work_item_id, version_no, parent_version_id, analysis_result_id, origin, editor_identity_id, save_key, format_status, source_format_id, source_format_version, applicability_json, rules_json, open_questions_json, rule_catalog_version, edit_notes_json, gmt_create, gmt_modified)
VALUES
  ('cfgv-01-3', 'cfg-01', 'wi-cfg-01', 3, 'cfgv-01-2', 'ar-cfg-01-1', 'HUMAN', 'identity-tester-01', 'save-cfg-01-v3', 'PROVIDED', 'AJ-FMT', '2026.03',
   '{"serviceProviderId":"sp-01","sourceSystem":"ANJIE-ERP","purpose":"INSTALLATION","businessScopeKey":"anjie-install-materials","formatStatus":"PROVIDED","sourceFormatId":"AJ-FMT","sourceFormatVersion":"2026.03","rowPath":"/rows","conditions":[],"basisReferences":["item-cfg-01-0a"],"unknownConditions":[]}',
   '[{"ruleId":"actual-length","sourceFields":["/实装长度"],"targetField":"installedQuantity","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/实装长度"},{"op":"halfwidth"},{"op":"stripSuffix","value":"米"},{"op":"decimal"},{"op":"scale","factor":"0.01"}]},"conditions":[]},{"ruleId":"unit-lookup","sourceFields":["/单位"],"targetField":"unit","operation":"PIPELINE","parameters":{"steps":[{"op":"field","path":"/单位"},{"op":"lookup","entries":[{"from":"m","to":"米"},{"from":"米","to":"米"}],"onMiss":"HOLD"}]},"conditions":[]}]',
   '[]', 'charging-transform-1',
   '[{"fieldPath":"rules[0].parameters.steps","before":"decimal 结束","after":"decimal 后追加 scale 0.01","reason":"核实原格式说明后发现长度以厘米登记，追加厘米到米换算","basisReferences":["item-cfg-01-0a"]}]',
   1789869600000, 1789869600000);

-- 事项指针推进到新候选（row_version 只能递增，assignee 不变则 responsibility_version 不变）
UPDATE work_item SET current_configuration_version_id='cfgv-01-3', row_version=4, gmt_modified=1789869600000 WHERE id='wi-cfg-01' AND row_version=3;

-- ========== 数据清理 ==========
-- 本域历史表受 DDL 触发器保护，禁止 DELETE/REPLACE（cfgv-01-3 无法删除）；
-- 执行后重置本地库（重载各域 DDL + TC-CFG-SEED.sql）恢复基线。
-- 残留核验（42201 后应无新启用产物、指针仍为 cfgv-01-1）：
-- SELECT COUNT(*) FROM configuration_enablement WHERE configuration_version_id='cfgv-01-3';
-- SELECT current_version_id, row_version FROM integration_config WHERE id='cfg-01';
