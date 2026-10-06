export const JD_ACCOUNT = 'acc-jd-business';
export const LEGACY_JD_ACCOUNTS = ['acc-jd-review', 'acc-jd-recon', 'acc-jd-coord'];
export const canonicalAccount = account => LEGACY_JD_ACCOUNTS.includes(account) ? JD_ACCOUNT : account;

// Executed during local bootstrap while all business services are stopped.
// Append authorization history and responsibility events; never rewrite old decisions.
export function mergeJdIdentitiesSql(now = Date.now()) {
  const oldIds = LEGACY_JD_ACCOUNTS.map(id => `'local:${id}'`).join(',');
  const target = 'local:' + JD_ACCOUNT;
  const eligible = `assignee_identity_id IN (${oldIds}) AND status <> 'COMPLETED'`;
  return `
INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified)
SELECT 'merge-jd-accounts-ready',CASE WHEN EXISTS(SELECT 1 FROM identity_reference WHERE id='${target}' AND subject_type='HUMAN')
 AND NOT EXISTS(SELECT 1 FROM work_item WHERE ${eligible} AND pending_write_id IS NOT NULL) THEN 1 ELSE 0 END,${now},${now};
DELETE FROM transaction_assertion WHERE id='merge-jd-accounts-ready';
INSERT INTO activity_record(id,work_item_id,event_key,event_type,actor_identity_id,fact_type,fact_id,occurred_at,details_json,gmt_create,gmt_modified)
SELECT 'jd-account-merge:'||id,id,'jd-account-merge:v1','RESPONSIBILITY_CHANGED','${target}','IDENTITY_MERGE','jd-business-v1',${now},
 json_object('fromIdentityId',assignee_identity_id,'toIdentityId','${target}','reason','京东核查、对账与履约统一由京东业务账号办理'),${now},${now}
FROM work_item WHERE ${eligible} AND NOT EXISTS(SELECT 1 FROM activity_record a WHERE a.work_item_id=work_item.id AND a.event_key='jd-account-merge:v1');
UPDATE work_item SET assignee_identity_id='${target}',responsibility_version=responsibility_version+1,row_version=row_version+1,gmt_modified=MAX(gmt_modified,${now})
WHERE ${eligible};
${LEGACY_JD_ACCOUNTS.map(id => `
INSERT INTO current_identity(id,identity_reference_id,subject_type,verified_at,valid_until,authorization_version,source_identities_json,grant_count,request_key,gmt_create,gmt_modified)
SELECT 'local:${id}:merged-jd-v1','local:${id}','HUMAN',stamp,NULL,'merged-jd-v1','[]',0,'local:${id}:merged-jd-v1',stamp,stamp
FROM (SELECT MAX(${now},COALESCE(MAX(verified_at)+1,${now})) AS stamp FROM current_identity WHERE identity_reference_id='local:${id}')
WHERE EXISTS(SELECT 1 FROM identity_reference WHERE id='local:${id}') AND NOT EXISTS(SELECT 1 FROM current_identity WHERE id='local:${id}:merged-jd-v1');`).join('\n')}
`;
}
