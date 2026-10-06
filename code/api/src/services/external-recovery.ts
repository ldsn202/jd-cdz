import { newId } from './change-batch';

export async function externalTarget(db: D1Database, operationId: string, queryOnly: boolean) {
  const op = await db.prepare(`SELECT o.id, o.interface_kind, o.status, o.request_json,
      wo.source_id, o.work_item_id, i.subject_id actor_account_id FROM external_write_operation o
    JOIN installation_work_order wo ON wo.id = o.installation_work_order_id
    JOIN human_decision d ON d.id=o.human_decision_id
    JOIN identity_reference i ON i.id=d.actor_identity_id AND i.subject_type='HUMAN' WHERE o.id = ?`)
    .bind(operationId).first<{
      id: string; interface_kind: string; status: string; request_json: string; source_id: string; work_item_id: string; actor_account_id:string;
    }>();
  if (!op) throw new Error('External operation missing');
  const request=JSON.parse(op.request_json),localMaterials=[];
  for(const ref of request.sourceMaterials??[]){
    if(ref.sourceSystem!=='LOCAL_UPLOAD')continue;
    const material=await db.prepare(`SELECT v.id materialVersionId,v.name,v.media_type mediaType,v.content_sha256 contentSha256,
      s.source_material_id sourceMaterialId,v.source_version sourceVersion FROM source_material_version v
      JOIN source_material s ON s.id=v.source_material_id WHERE s.source_system='LOCAL_UPLOAD' AND s.source_material_id=? AND v.source_version=?`)
      .bind(ref.sourceMaterialId,ref.sourceVersion).first();
    if(!material)throw new Error('Confirmed upload version missing');
    localMaterials.push(material);
  }
  return {
    operationId: op.id, installationWorkOrderId: op.source_id, workItemId: op.work_item_id,
    interfaceKind: op.interface_kind, request, actorAccountId:op.actor_account_id, localMaterials,
    queryOnly: queryOnly || op.status !== 'REGISTERED',
  };
}

export function scheduleExternalQuery(db: D1Database, operationId: string, afterJobId: string, now: number) {
  const key = `query:${operationId}:${afterJobId}`;
  return db.prepare(`INSERT INTO background_job
    (id,purpose,service_provider_id,work_item_id,external_write_id,target_json,dedupe_key,status,available_at,
     lease_epoch,row_version,gmt_create,gmt_modified)
    SELECT ?, 'QUERY_EXTERNAL', o.service_provider_id, o.work_item_id, o.id, ?, ?, 'READY', ?, 0, 1, ?, ?
    FROM external_write_operation o WHERE o.id = ?
      AND NOT EXISTS (SELECT 1 FROM background_job WHERE dedupe_key = ?)`)
    .bind(newId('bj'), JSON.stringify({ operationId, queryOnly: true }), key, now, now, now, operationId, key);
}
