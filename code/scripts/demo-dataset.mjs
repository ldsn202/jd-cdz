import {access,mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const exists=p=>access(p).then(()=>true,()=>false);
// Called only after all owned services stop. Move whole stores so historical evidence remains recoverable.
export async function upgradeDemoDataset(root,datasetId) {
  const local=join(root,'.local'),source=join(root,'mocks/.data/mock-env-a'),journal=join(local,'demo-upgrade.json');
  let migration=await exists(journal)?JSON.parse(await readFile(journal,'utf8')):null;
  if(!migration) {
    if(!await exists(source)||await exists(join(source,'delivery',datasetId,'data-manifest.json')))return null;
    const old=await exists(join(source,'delivery/demo-10-v3/data-manifest.json')) ? join(source,'delivery/demo-10-v3/data-manifest.json') : await exists(join(source,'delivery/demo-10-v2/data-manifest.json')) ? join(source,'delivery/demo-10-v2/data-manifest.json') : join(source,'delivery/standard-v1/data-manifest.json');
    if(!await exists(old))throw Error('已有来源不是可升级的旧标准集，数据保持原样，请检查来源清单。');
    const manifest=JSON.parse(await readFile(old,'utf8'));
    if(![10,100].includes(manifest.totals.providers))throw Error('旧标准集规模不符合升级条件，未改动数据。');
    migration={archive:join(local,'before-demo-10-'+randomUUID()),datasetId,createdAt:new Date().toISOString()};
    await mkdir(migration.archive,{recursive:true});
    await writeFile(journal,JSON.stringify(migration));
  }
  for(const [from,name] of [[source,'source'],[join(root,'.wrangler/state'),'state'],[join(local,'import-report.json'),'import-report.json']]) {
    const dest=join(migration.archive,name);
    if(await exists(from)&&!await exists(dest))await rename(from,dest);
  }
  await writeFile(join(migration.archive,'migration.json'),JSON.stringify(migration,null,2));
  await rm(journal);
  console.log('旧数据完整保存在 '+migration.archive+'；现在初始化 10 家服务商演示集。');
  return migration;
}
