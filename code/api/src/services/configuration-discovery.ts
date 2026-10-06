import {createExternalClient,type ExternalEnv} from './external';
import {newId,ServiceError} from './change-batch';
import {resolveResponsibility} from './responsibility';
import {checkEnabledConfigurationSample} from './analysis-configurations';
import type {AnalysisRecord} from './analysis-sources';
import {scheduleInputPreparation,type DiscoveryAdoption} from './source-discovery';
type Change={id:string;source_system:string;source_record_id:string;source_version:string|null};
const sha=async(s:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function discoverConfiguration(db:D1Database,env:ExternalEnv,providerId:string,change:Change):Promise<DiscoveryAdoption>{
 const blocked=(issue:string):DiscoveryAdoption=>({statements:[],jobStatus:'BLOCKED',result:{workItemIds:[],issues:[issue]}});
 const data=await createExternalClient(env).providerDocuments.getDocuments(change.source_system,providerId,change.source_record_id),source=data.sourceRecord;
 if(source.serviceProviderId!==providerId||source.sourceSystem!==change.source_system||source.sourceRecordId!==change.source_record_id||source.sourceVersion!==change.source_version)return blocked('配置资料身份或版本与变化不一致');
 if(source.purpose!=='CONFIGURATION'||source.installationWorkOrderId!==null||!['INSTALLATION','RECONCILIATION'].includes(source.configurationPurpose??'')||!source.businessScopeKey?.trim())return blocked('来源未明确配置样例的用途与业务范围');
 const record:AnalysisRecord={inputId:'configuration-sample',recordType:'PROVIDER_RECORD',sourceSystem:source.sourceSystem,sourceRecordId:source.sourceRecordId,sourceVersion:source.sourceVersion,data:data as unknown as Record<string,unknown>};
 const checked=await checkEnabledConfigurationSample(db,providerId,record);
 if(checked.dependencies.length&&checked.issues.length===0){
  const now=Date.now(),statements:D1PreparedStatement[]=[];
  for(const d of checked.dependencies){const id=newId('config-check-fence');statements.push(db.prepare(`INSERT INTO transaction_assertion SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM integration_config WHERE id=? AND current_version_id=? AND current_activation_result_id=?) THEN 1 ELSE 0 END,?,?`).bind(id,d.configurationId,d.configurationVersionId,d.activationResultId,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id));}
  return {statements,jobStatus:'SUCCEEDED',result:{workItemIds:[],issues:[],configurationCheck:record.data._controlledTransformation} as DiscoveryAdoption['result']};
 }
 const now=Date.now(),statements:D1PreparedStatement[]=[];
 const config=await db.prepare('SELECT id FROM integration_config WHERE service_provider_id=? AND source_system=? AND purpose=? AND business_scope_key=?').bind(providerId,source.sourceSystem,source.configurationPurpose,source.businessScopeKey).first<{id:string}>();
 const configId=config?.id??newId('config'),identity=JSON.stringify([providerId,'CONFIGURATION','CONFIG_SCOPE',source.sourceSystem,source.businessScopeKey,'CONFIGURATION_SCOPE',source.sourceSystem,source.configurationPurpose,'ENABLE_CONFIGURATION']);
 const key=await sha(identity),creation=`configuration-source:${providerId}:${source.sourceSystem}:${source.sourceRecordId}:${source.sourceVersion}`;
 const created=await db.prepare('SELECT id FROM work_item WHERE creation_key=?').bind(creation).first<{id:string}>();
 if(created)return {statements:[],jobStatus:'SUCCEEDED',result:{workItemIds:[created.id],issues:[]}};
 const current=await db.prepare("SELECT id,business_identity_json,row_version,analysis_generation,status FROM work_item WHERE service_provider_id=? AND item_kind='CONFIGURATION' AND business_key=? AND status<>'COMPLETED'").bind(providerId,key).first<{id:string;business_identity_json:string;row_version:number;analysis_generation:number;status:string}>();
 if(current&&current.business_identity_json!==identity)throw new ServiceError(409,40901,'配置业务身份摘要冲突');
 if(current&&['PROCESSING','WAITING_REPLY','WAITING_SUPPLEMENT','EXCEPTION'].includes(current.status))return {statements:[],jobStatus:'RETRY_WAIT',result:{workItemIds:[current.id],issues:['配置事项等待人员或外部处理，来源变化保留待重试']}};
 const itemId=current?.id??newId('work-config'),event=`configuration-source:${providerId}:${source.sourceSystem}:${source.sourceRecordId}:${source.sourceVersion}`;
 if(current&&await db.prepare('SELECT id FROM activity_record WHERE work_item_id=? AND event_key=?').bind(itemId,event).first())return {statements:[],jobStatus:'SUCCEEDED',result:{workItemIds:[itemId],issues:[]}};
 if(!config)statements.push(db.prepare('INSERT INTO integration_config(id,service_provider_id,source_system,purpose,business_scope_key,row_version,gmt_create,gmt_modified) VALUES(?,?,?,?,?,1,?,?)').bind(configId,providerId,source.sourceSystem,source.configurationPurpose,source.businessScopeKey,now,now));
 if(!current){const assignee=await resolveResponsibility(db,providerId,'ENABLE_INTEGRATION_CONFIG');statements.push(db.prepare(`INSERT INTO work_item(id,service_provider_id,item_kind,business_key,business_identity_json,creation_key,title,status,integration_config_id,assignee_identity_id,blocked_reason,gmt_create,gmt_modified) VALUES(?,?,'CONFIGURATION',?,?,?,?,'PREPARING',?,?,?,?,?)`).bind(itemId,providerId,key,identity,creation,'资料接入配置 · '+source.businessScopeKey,configId,assignee,assignee?null:'RESPONSIBILITY_UNRESOLVED',now,now));}
 else {statements.push(db.prepare("UPDATE work_item SET analysis_generation=analysis_generation+1,current_analysis_result_id=NULL,status='PREPARING',row_version=row_version+1,gmt_modified=? WHERE id=? AND row_version=? AND pending_write_id IS NULL").bind(now,itemId,current.row_version));const id=newId('config-source-assert');statements.push(db.prepare('INSERT INTO transaction_assertion VALUES(?,changes(),?,?)').bind(id,now,now),db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id));}
 statements.push(db.prepare(`INSERT INTO activity_record(id,work_item_id,event_key,event_type,fact_type,fact_id,details_json,gmt_create,gmt_modified) VALUES(?,?,?,'SOURCE_CHANGE_RECORDED','SOURCE_CHANGE',?,?,?,?)`).bind(newId('activity'),itemId,event,change.id,JSON.stringify({sourceReferences:[{recordType:'PROVIDER_RECORD',sourceSystem:source.sourceSystem,sourceRecordId:source.sourceRecordId,sourceVersion:source.sourceVersion}],configurationScope:{purpose:source.configurationPurpose,businessScopeKey:source.businessScopeKey},configurationCheck:checked}),now,now));
 statements.push(scheduleInputPreparation(db,itemId,(current?.analysis_generation??0)+1,providerId,now));
 return {statements,jobStatus:'SUCCEEDED',result:{workItemIds:[itemId],issues:[]}};
}
