import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import type {DatabaseSync} from 'node:sqlite';
import {hasAction,type Account} from '../identity/sessions.ts';
import {ROLE_ACTIONS} from '../identity/roles.ts';
import {recs,type RouteResult} from '../jd-bills/read.ts';
type Auth={account:Account;grants:{grantId:string;scopeProviderIds:string[]}[]};
export function registerUploadedMaterial(files:DatabaseSync,installation:DatabaseSync,filesDir:string,auth:Auth,orderId:string,body:any):RouteResult{
 const fail=(http:number,msg:string):RouteResult=>({http,body:{code:http*100+1,msg,data:null}});
 const wo=recs(installation,'work_order').find(w=>w.id===orderId);
 if(!wo)return fail(404,'工单不存在');
 const provider=wo.payload.serviceProviderId;
 if(!hasAction(auth,'SUBMIT_INSTALLATION_DETAIL',provider,ROLE_ACTIONS)&&!hasAction(auth,'SUBMIT_SUPPLEMENT',provider,ROLE_ACTIONS))return fail(403,'只能传送本人服务商工单的上传材料');
 const types=['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
 if(!body||!/^up-[a-zA-Z0-9-]+$/.test(body.sourceMaterialId)||body.sourceVersion!=='local:'+body.sourceMaterialId
   ||typeof body.name!=='string'||!body.name.trim()||!types.includes(body.mediaType)||typeof body.contentBase64!=='string'
   ||body.contentBase64.length>14*1024*1024)return fail(400,'上传材料元数据无效');
 const bytes=Buffer.from(body.contentBase64,'base64'),hash=createHash('sha256').update(bytes).digest('hex');
 if(!bytes.length||bytes.length>10*1024*1024||hash!==body.contentSha256)return fail(400,'上传字节与确认文件摘要不一致');
 const id=body.sourceMaterialId,version=body.sourceVersion,old=recs(files,'file_meta').find(f=>f.id===id);
 if(old&&(old.payload.sha256!==hash||old.payload.installationWorkOrderId!==orderId))return fail(409,'该材料编号已用于其他文件或工单');
 const index=recs(installation,'material_index').find(m=>m.id===id);
 if(index&&(index.version!==version||index.payload.installationWorkOrderId!==orderId))return fail(409,'材料归属不一致');
 const now=new Date().toISOString(),relativePath='uploaded/'+id;
 mkdirSync(path.join(filesDir,'uploaded'),{recursive:true});
 // Retrying repairs either half of a interrupted registration without changing bytes.
 writeFileSync(path.join(filesDir,relativePath),bytes,{mode:0o600});
 if(!old)files.prepare('INSERT INTO source_record(kind,record_id,source_version,source_updated_at,payload_json) VALUES(?,?,?,?,?)')
 .run('file_meta',id,version,now,JSON.stringify({fileId:id,sourceVersion:version,name:body.name,mediaType:body.mediaType,sha256:hash,relativePath,installationWorkOrderId:orderId}));
 if(!index)installation.prepare('INSERT INTO source_record(kind,record_id,source_version,source_updated_at,payload_json) VALUES(?,?,?,?,?)')
 .run('material_index',id,version,now,JSON.stringify({sourceMaterialId:id,installationWorkOrderId:orderId,name:body.name,mediaType:body.mediaType,
 fileRef:{fileId:id,sourceSystem:'LOCAL_UPLOAD',sourceVersion:version}}));
 return {http:200,body:{code:0,msg:'success',data:{sourceSystem:'LOCAL_UPLOAD',sourceMaterialId:id,sourceVersion:version,contentSha256:hash}}};
}

