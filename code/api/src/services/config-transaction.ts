import {newId,ServiceError} from './change-batch';

// Runs immediately after a conditional UPDATE, so zero rows aborts the same batch.
export function assertConfigurationWrite(db:D1Database,now:number):D1PreparedStatement[] {
 const id=newId('config-assert');
 return [db.prepare('INSERT INTO transaction_assertion(id,passed,gmt_create,gmt_modified) VALUES(?,changes(),?,?)').bind(id,now,now),
  db.prepare('DELETE FROM transaction_assertion WHERE id=?').bind(id)];
}
export async function commitConfiguration(db:D1Database,statements:D1PreparedStatement[]) {
 try{return await db.batch(statements);}
 catch(error){
  if(/passed|transaction_assertion/.test((error as Error).message))throw new ServiceError(409,40901,'配置或事项版本已变化，整个操作已回滚');
  throw error;
 }
}
