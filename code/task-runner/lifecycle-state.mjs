import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';

export const PROTOCOL='jd-charging-local-lifecycle-v1';
export function validateEnvironmentId(id){if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id))throw Error('envId must contain 2-32 lowercase letters, digits or hyphens');return id;}
export async function atomicJson(file,value){await writeFile(file+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(file+'.tmp',file);}
export class LifecycleRegistry{
 constructor(root){this.root=root;this.file=join(root,'registry.json');this.state={protocol:PROTOCOL,activeEnvId:null,environments:{}};}
 async load(){await mkdir(this.root,{recursive:true,mode:0o700});try{this.state=JSON.parse(await readFile(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(this.state.protocol!==PROTOCOL)throw Error('Unsupported lifecycle registry');
  for(const entry of Object.values(this.state.environments)){validateEnvironmentId(entry.envId);if(['BUILDING','IMPORTING'].includes(entry.status)){entry.status='FAILED';entry.error='Interrupted lifecycle operation; environment cannot be reused';}else if(['ACTIVE','VERIFIED','PROVISIONED','PAUSED'].includes(entry.status)){entry.resumeStatus=entry.status;entry.status='STOPPED';}}
  await this.save();return this;
 }
 async save(){await atomicJson(this.file,this.state);}
 get(id){validateEnvironmentId(id);const e=this.state.environments[id];if(!e)throw Error('Environment is not owned by this lifecycle manager');return e;}
 async reserve(id,fields){validateEnvironmentId(id);if(Object.hasOwn(this.state.environments,id))throw Error('Environment id already reserved; unfinished environments cannot be reused');await mkdir(join(this.root,id),{mode:0o700});this.state.environments[id]={...fields,envId:id,status:'BUILDING',createdAt:new Date().toISOString()};await this.save();return this.get(id);}
 async update(id,fields){Object.assign(this.get(id),fields,{updatedAt:new Date().toISOString()});await this.save();return this.get(id);}
 assertVerified(id){const e=this.get(id);if(!['VERIFIED','ACTIVE'].includes(e.status))throw Error('Environment has not passed actual import verification');return e;}
 async activate(id){const e=this.assertVerified(id),prior=this.state.activeEnvId;if(prior&&prior!==id&&this.state.environments[prior])this.state.environments[prior].status='PAUSED';this.state.activeEnvId=id;e.status='ACTIVE';await this.save();return e;}
}
const quote=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
export function identityBootstrapSql(context,envId){
 if(context.subjectType!=='SERVICE'||!Array.isArray(context.grants)||context.sourceIdentities?.length)throw Error('Expected an actual SERVICE identity context');
 const verified=Date.parse(context.verifiedAt),now=Math.max(Date.now(),verified);if(!Number.isFinite(verified))throw Error('Identity timestamp missing');
 const ref='lifecycle-service:'+envId,ctx=ref+':context';
 const row=(table,values)=>`INSERT INTO ${table} VALUES(${values.map(quote).join(',')});`;
 const sql=[row('identity_reference',[ref,context.identitySource,context.subjectId,'SERVICE',context.displayName,now,now])];
 for(const [i,g]of context.grants.entries()){
  if(g.businessRole!==null||!g.scope||!Array.isArray(g.actions)||!g.actions.length||!Array.isArray(g.scope.resourceIds)||!g.scope.resourceIds.length)throw Error('Incomplete source permission');
  sql.push(row('business_permission',[ref+':grant:'+i,ctx,g.grantId,null,JSON.stringify(g.actions),g.scope.scopeType,g.scope.sourceSystem,g.scope.recordType,JSON.stringify(g.scope.resourceIds),now,now]));
 }
 sql.push(row('current_identity',[ctx,ref,'SERVICE',verified,context.validUntil?Date.parse(context.validUntil):null,context.authorizationVersion,'[]',context.grants.length,ctx,now,now]));return sql.join('\n');
}
