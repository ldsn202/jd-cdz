import {sourceImportScope,startSourceImport} from './source-import';
import {receiveChangeBatch,ServiceError,canReadChanges} from './change-batch';
import type {ResolvedIdentity} from './identity';
import {createExternalClient,type ExternalEnv} from './external';
export async function initializeSourceMonitor(db:D1Database,env:ExternalEnv,identity:ResolvedIdentity,providerId:string,sourceSystem='installation-admin'){
 const scope=await sourceImportScope(env,identity,sourceSystem);
 if(!scope.serviceProviderIds.includes(providerId))throw new ServiceError(403,40301,'来源监测服务商越出授权范围');
 const old=await db.prepare(`SELECT f.id AS feedId,g.id AS generationId,g.current_cursor AS cursor FROM change_feed f JOIN change_feed_generation g ON g.feed_id=f.id AND g.state='READY' WHERE f.service_provider_id=? AND f.source_system=? ORDER BY g.generation_no DESC LIMIT 1`).bind(providerId,sourceSystem).first();
 if(old)return old;
 const receipt=await startSourceImport(env,identity,{serviceProviderId:providerId,sourceSystem}),now=Date.now(),generationId=`generation:${receipt.feedId}:${receipt.generation}`;
 await db.batch([
 db.prepare('INSERT INTO change_feed VALUES(?,?,?,?,?)').bind(receipt.feedId,providerId,receipt.sourceSystem,now,now),
 db.prepare(`INSERT INTO change_feed_generation(id,feed_id,generation_no,scope_json,start_cursor,current_cursor,state,row_version,gmt_create,gmt_modified) VALUES(?,?,?,?,?,?,'READY',1,?,?)`).bind(generationId,receipt.feedId,receipt.generation,JSON.stringify({serviceProviderId:providerId}),receipt.startCursor,receipt.startCursor,now,now)]);
 return {feedId:receipt.feedId,generationId,cursor:receipt.startCursor};
}
export async function pollSourceMonitor(db:D1Database,env:ExternalEnv,identity:ResolvedIdentity,feedId:string){
 const feed=await db.prepare(`SELECT f.id,f.service_provider_id,f.source_system,g.id AS generation_id,g.current_cursor FROM change_feed f JOIN change_feed_generation g ON g.feed_id=f.id AND g.state='READY' WHERE f.id=?`).bind(feedId).first<{id:string;service_provider_id:string;source_system:string;generation_id:string;current_cursor:string}>();
 if(!feed||!canReadChanges(identity,feed.id,feed.service_provider_id,feed.source_system))throw new ServiceError(404,40404,'变化订阅不存在或不可见');
 const page=await createExternalClient(env).changes.getChanges(feed.id,feed.current_cursor,10);
 if(page.feedId!==feed.id||page.serviceProviderId!==feed.service_provider_id||page.sourceSystem!==feed.source_system)throw new ServiceError(502,50201,'来源变化范围与本地订阅不一致');
 const result=await receiveChangeBatch(db,identity,{feedId:feed.id,generationId:feed.generation_id,expectedCursor:feed.current_cursor,response:page as never});
 return {...result,hasMore:page.hasMore};
}
