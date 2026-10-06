-- 草稿 v2：换绑 COMPLETE 上下文快照（草稿版本链式新增，草稿指针条件 UPDATE）。

INSERT INTO installation_draft_version (id, installation_draft_id, work_item_id, version_no, parent_version_id, analysis_result_id, context_snapshot_id, origin, editor_identity_id, items_json, source_materials_json, open_questions_json, edit_notes_json, save_key, gmt_create, gmt_modified)
SELECT 'dv-dev-2b', 'draft-dev-2', 'w-dev-2', 2, 'dv-dev-2', 'ar-dev-2', 'ctx-dev-2b', 'HUMAN', 'ir-dev-provider-clerk2',
 '[{"installationItem":"桥架安装","installedQuantity":12,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"},{"installationItem":"电缆敷设","installedQuantity":45,"unit":"米","materialSupplier":"服务商","serviceScope":"供料及安装"}]',
 '[]', '[]', '[]', 'save-dev-2b', 1789862410000, 1789862410000
WHERE NOT EXISTS (SELECT 1 FROM installation_draft_version WHERE id = 'dv-dev-2b');

UPDATE installation_draft SET current_version_id = 'dv-dev-2b', row_version = 2, gmt_modified = 1789862410000
WHERE id = 'draft-dev-2' AND current_version_id = 'dv-dev-2';
