import {useState} from 'react';
import {apiFetch,materialContentUrl} from '../../api';
import {useApiData} from '../../hooks';
import {ActionStatus,useAction,versions,itemPath,type PanelProps} from './ActionShared';
type Material={materialVersionId:string;name:string;mediaType:string;parsingId:string;profileId:string;units:{unitId:string;index:number;text:string}[]};
function TextEditor({file,item,onChanged,canConfirm}:PanelProps&{file:Material;canConfirm:boolean}){
 const [texts,setTexts]=useState(file.units),[checked,setChecked]=useState(false);
 const action=useAction(onChanged),confirmed=file.profileId==='human-text-review';
 return <details className="source-record"><summary>{file.name} · {confirmed?'文字已人工核对':'识别文字待核对'}</summary>
 <p className="state-desc">逐页对照原文件核对文字。文字确认保留人员记录，不代表安装审核通过。</p>
 {file.mediaType==='application/pdf'?<iframe title={file.name} src={materialContentUrl(file.materialVersionId)+"?preview=true"} style={{width:'100%',height:440,border:'1px solid #ddd'}}/>:<img alt={file.name} src={materialContentUrl(file.materialVersionId)+"?preview=true"} style={{maxWidth:'100%',maxHeight:600}}/>}
 {texts.map((unit,i)=><label className="form-row" key={unit.unitId}>第 {unit.index} 页识别文字<textarea aria-label={file.name+'第'+unit.index+'页文字'} rows={9} style={{width:'100%'}} value={unit.text} readOnly={!canConfirm||confirmed} onChange={e=>setTexts(texts.map((u,j)=>j===i?{...u,text:e.target.value}:u))}/></label>)}
 {canConfirm&&!confirmed&&<><label className="evidence-choice"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>已逐页核对全部文字，文件中没有遗漏需要判断的图示、现场照片或签字信息。</label><button className="btn-primary" disabled={!checked||action.busy||texts.some(u=>!u.text.trim())} onClick={()=>action.run(itemPath(item,'material-text-confirmations'),{...versions(item),materialVersionId:file.materialVersionId,parsingId:file.parsingId,acknowledgeTextOnly:true,units:texts.map(({unitId,text})=>({unitId,text}))},'保存人工核对的材料文字，随后手动运行分析')}>确认材料文字</button><ActionStatus action={action} onRefresh={onChanged}/></>}
 </details>;
}
export function MaterialTextReview(props:PanelProps){
 const [view,reload]=useApiData(()=>apiFetch<{list:Material[];canConfirm:boolean}>(itemPath(props.item,'material-texts')),[props.item.workItemId,props.item.rowVersion],true);
 if(view.status!=='ready'||!view.data.list.length)return null;
 return <section><h4>PDF / 图片识别文字</h4>{view.data.list.map(file=><TextEditor key={file.parsingId} {...props} file={file} canConfirm={view.data.canConfirm} onChanged={()=>{reload();props.onChanged();}}/>)}</section>;
}
