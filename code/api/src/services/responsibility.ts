// 当前具体责任人的解析：按服务商范围与所需动作，从已授权的 HUMAN 身份中取一名责任人。
// 没有匹配身份时返回 null，由调用方保留待分配（不向同角色所有人员放行）。

export async function resolveResponsibility(
  db: D1Database,
  providerId: string,
  action: string
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT i.id AS identity_id
       FROM business_permission p
       JOIN current_identity c ON c.id = p.context_id
       JOIN identity_reference i ON i.id = c.identity_reference_id
       WHERE p.scope_type = 'SERVICE_PROVIDER' AND i.subject_type = 'HUMAN'
         AND (c.valid_until IS NULL OR c.valid_until > ?)
         AND c.id = (SELECT latest.id FROM current_identity latest
           WHERE latest.identity_reference_id=i.id ORDER BY latest.verified_at DESC,latest.id DESC LIMIT 1)
         AND EXISTS (SELECT 1 FROM json_each(p.resource_ids_json) r WHERE r.value = ?)
         AND EXISTS (SELECT 1 FROM json_each(p.actions_json) a WHERE a.value = ?)
       ORDER BY p.gmt_create, p.id LIMIT 1`
    )
    .bind(Date.now(), providerId, action)
    .first<{ identity_id: string }>();
  return row?.identity_id ?? null;
}
