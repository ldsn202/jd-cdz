export const RETIRED_PROVIDER_ACCOUNT = 'acc-jd-config';

// Run after importing the new scoped contexts, while business services are stopped.
export function mergeProviderIdentitiesSql(now = Date.now()) {
  const eligible = "assignee_identity_id='local:acc-jd-config' AND status<>'COMPLETED'";
  const target = "'local:acc-'||lower(work_item.service_provider_id)";
  return `
INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified)
SELECT 'merge-provider-accounts-ready',CASE WHEN NOT EXISTS(
 SELECT 1 FROM work_item WHERE ${eligible} AND (item_kind<>'CONFIGURATION' OR pending_write_id IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM identity_reference r JOIN current_identity c ON c.id=(SELECT id FROM current_identity WHERE identity_reference_id=r.id ORDER BY verified_at DESC,id DESC LIMIT 1)
  JOIN business_permission p ON p.context_id=c.id
  WHERE r.id=${target} AND r.subject_type='HUMAN' AND (c.valid_until IS NULL OR c.valid_until>${now})
  AND p.scope_type='SERVICE_PROVIDER' AND json_array_length(p.resource_ids_json)=1
  AND json_extract(p.resource_ids_json,'$[0]')=work_item.service_provider_id
  AND EXISTS(SELECT 1 FROM json_each(p.actions_json) WHERE value='ENABLE_INTEGRATION_CONFIG')
 ))) THEN 1 ELSE 0 END,${now},${now};
DELETE FROM transaction_assertion WHERE id='merge-provider-accounts-ready';
INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'provider-account-merge:'||id,id,'provider-account-merge:v1','RESPONSIBILITY_CHANGED',NULL,'IDENTITY_MERGE','provider-business-v1',${now},
 json_object('fromIdentityId',assignee_identity_id,'toIdentityId',${target},'reason','接入配置由所属服务商账号办理'),${now},${now}
FROM work_item WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM activity_record a WHERE a.work_item_id=work_item.id AND a.event_key='provider-account-merge:v1');
UPDATE work_item SET assignee_identity_id=${target},responsibility_version=responsibility_version+1,row_version=row_version+1,gmt_modified=MAX(gmt_modified,${now}) WHERE ${eligible};
INSERT INTO current_identity(id,identity_reference_id,subject_type,verified_at,valid_until,authorization_version,source_identities_json,grant_count,request_key,gmt_create,gmt_modified)
SELECT 'local:acc-jd-config:retired-provider-v1','local:acc-jd-config','HUMAN',stamp,NULL,'retired-provider-v1','[]',0,'local:acc-jd-config:retired-provider-v1',stamp,stamp
FROM (SELECT MAX(${now},COALESCE(MAX(verified_at)+1,${now})) AS stamp FROM current_identity WHERE identity_reference_id='local:acc-jd-config')
WHERE EXISTS(SELECT 1 FROM identity_reference WHERE id='local:acc-jd-config') AND NOT EXISTS(SELECT 1 FROM current_identity WHERE id='local:acc-jd-config:retired-provider-v1');
`;
}
