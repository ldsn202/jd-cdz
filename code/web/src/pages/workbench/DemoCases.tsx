import {useState} from 'react';
import {apiFetch} from '../../api';
import {useApiData} from '../../hooks';
import {useSession,reloadForAccountChange} from '../../session';
import {KIND_LABEL,STATUS_LABEL} from '../../labels';
type Item={workItemId:string;kind:string;status:string;accountId:string|null};
type Case={providerId:string;providerName:string;workOrderId:string|null;title:string;instructions:string;items:Item[]};
export function DemoCases(){
 const session=useSession(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [data]=useApiData(()=>apiFetch<{list:Case[]}>('/api/admin/charging/demo-cases'),[]);
 if(session.status!=='ready'||!session.session.accountSwitchingAvailable||data.status!=='ready')return null;
 const open=async(item:Item)=>{setBusy(true);setError('');try{
   if(item.accountId)await apiFetch('/api/admin/charging/session/switch',{method:'POST',body:JSON.stringify({accountId:item.accountId})});
   reloadForAccountChange(true,'/work-items/'+item.kind+'/'+item.workItemId);
 }catch(e){setError((e as Error).message);setBusy(false);}};
 return <details className="panel" open style={{padding:24,marginBottom:24}}><summary style={{fontSize:20,fontWeight:700}}>初始化演示案例 · {data.data.list.length} 家服务商</summary>
 <p className="state-desc">上传文件和逐步说明放在项目根目录“测试用上传数据”。点击办理入口会切换到该事项的责任账号；分析仍需在详情中手动点击。</p>
 {error&&<p role="alert" className="action-error">{error}</p>}
 <div className="table-scroll"><table className="business-table"><thead><tr><th>服务商 / 工单</th><th>演示内容</th><th>办理入口</th></tr></thead><tbody>{data.data.list.map(c=><tr key={c.providerId}><td>{c.providerName}<p className="state-desc">{c.workOrderId??'映射配置'}</p></td><td><strong>{c.title}</strong><p className="state-desc">{c.instructions}</p></td><td>{c.items.map(item=><div key={item.workItemId}><button className="btn-link" disabled={busy} onClick={()=>open(item)}>{KIND_LABEL[item.kind]??item.kind} · {STATUS_LABEL[item.status]??item.status}</button></div>)}</td></tr>)}</tbody></table></div></details>;
}
