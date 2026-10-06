// T4.3: material references and current supplement request come from persisted facts.
export async function readAnalysisContext(db: D1Database, snapshotId: string) {
  const records = await db.prepare(`SELECT input_key, record_type, data_json FROM analysis_input_item
    WHERE snapshot_id = ? AND input_kind = 'RECORD' ORDER BY input_key`).bind(snapshotId)
    .all<{ input_key: string; record_type: string; data_json: string }>();
  const materials = await db.prepare(`SELECT i.input_key, v.id AS material_version_id,
      m.source_system, m.source_material_id, v.source_version
    FROM analysis_input_item i JOIN material_parsing p ON p.id = i.parsing_id
    JOIN source_material_version v ON v.id = p.source_material_version_id
    JOIN source_material m ON m.id = v.source_material_id
    WHERE i.snapshot_id = ? AND i.input_kind = 'PARSED_MATERIAL' ORDER BY i.input_key`)
    .bind(snapshotId).all<{
      input_key: string; material_version_id: string; source_system: string;
      source_material_id: string; source_version: string;
    }>();
  return {
    contextRecords: records.results.map(r => ({ inputId: r.input_key, recordType: r.record_type, data: JSON.parse(r.data_json) })),
    evidenceMaterials: materials.results.map(r => ({
      inputId: r.input_key, materialVersionId: r.material_version_id, sourceSystem: r.source_system,
      sourceMaterialId: r.source_material_id, sourceVersion: r.source_version,
    })),
  };
}

export async function readSupplementRequest(db: D1Database, workItemId: string, requestId: string | null) {
  if (!requestId) return null;
  const request = await db.prepare(`SELECT content_json FROM human_decision
    WHERE id = ? AND work_item_id = ? AND action_type = 'REQUEST_SUPPLEMENT'`)
    .bind(requestId, workItemId).first<{ content_json: string }>();
  if (!request) return null;
  const content = JSON.parse(request.content_json) as { questions?: unknown[]; comment?: string };
  const replies = await db.prepare(`SELECT id, submit_decision_id, reply_text, materials_json, success_verified_at
    FROM supplemental_response WHERE request_decision_id = ? AND work_item_id = ? ORDER BY gmt_create, id`)
    .bind(requestId, workItemId).all<{
      id: string; submit_decision_id: string; reply_text: string; materials_json: string; success_verified_at: number | null;
    }>();
  return {
    requestDecisionId: requestId, questions: content.questions ?? [], comment: content.comment ?? null,
    replies: replies.results.map(r => ({
      responseId: r.id, decisionId: r.submit_decision_id, replyText: r.reply_text,
      materialVersionIds: JSON.parse(r.materials_json), successVerifiedAt: r.success_verified_at,
    })),
  };
}
