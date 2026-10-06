import type { AnalysisItem, AnalysisRecord } from './analysis-sources';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
type Block = { unitId: string; cellRange: string | null; text: string | null; formula: string | null };
// These are the exact documented installation fields, not inferred meanings for arbitrary headers.
const INSTALLATION_FIELDS: Record<string, string> = {
  '安装项目': '安装项目', installationItem: '安装项目',
  '实际安装数量': '实际安装数量', installedQuantity: '实际安装数量',
  '单位': '计量单位', unit: '计量单位',
  '供料方': '材料提供方', materialSupplier: '材料提供方',
  '服务范围': '服务范围', serviceScope: '服务范围',
};

export function workbookRows(units: {unitId:string;name:string|null;status:string}[], blocks: Block[]) {
  const rows: Record<string, string | null>[] = [], positions: {sheet:string;row:number}[] = [];
  let fields: string[] | null = null;
  for (const unit of units) {
    if (unit.status !== 'COMPLETE') throw Error('工作表尚未完整解析，不能生成字段映射输入');
    const cells = blocks.filter(b => b.unitId === unit.unitId && b.cellRange);
    if (!cells.length) continue;
    if (cells.some(b => b.formula)) throw Error('映射样例含公式，请上传已核实的实际值');
    const headers = new Map<string, string>();
    for (const b of cells) {
      const address = /^([A-Z]+)([1-9][0-9]*)$/.exec(b.cellRange!);
      if (!address) throw Error('单元格位置无效');
      if (address[2] === '1') {
        const label = b.text?.trim();
        if (!label || [...headers.values()].includes(label)) throw Error('首行字段名为空或重复');
        headers.set(address[1], label);
      }
    }
    const names = [...headers.values()].sort();
    if (!names.length) throw Error('Excel 首行须为字段名，第二行起为实际数据');
    if (fields && JSON.stringify(fields) !== JSON.stringify(names)) throw Error('各工作表字段不同，请按同一套字段分别上传配置样例');
    fields = names;
    const sheetRows = new Map<number, Record<string, string | null>>();
    for (const b of cells) {
      const [, col, rowText] = /^([A-Z]+)([1-9][0-9]*)$/.exec(b.cellRange!)!;
      const row = Number(rowText); if (row === 1) continue;
      const header = headers.get(col); if (!header) throw Error('数据列缺少首行字段名');
      const value = sheetRows.get(row) ?? Object.fromEntries(names.map(name => [name, null]));
      Object.defineProperty(value, header, {value:b.text,enumerable:true,writable:true,configurable:true});
      sheetRows.set(row, value);
    }
    for (const [row, data] of [...sheetRows].sort(([a],[b]) => a-b)) {
      if (rows.length >= 10000) throw Error('映射样例最多支持 10000 行，请拆分文件后上传');
      rows.push(data); positions.push({sheet:unit.name ?? unit.unitId,row});
    }
  }
  if (!fields || !rows.length) throw Error('工作簿没有可用于映射的实际数据行');
  return { fields, rows, positions };
}

export async function readConfigurationUpload(db: D1Database, item: AnalysisItem, sourceRecords: AnalysisRecord[]) {
  if (item.item_kind !== 'CONFIGURATION' || !item.integration_config_id) return null;
  const upload = await db.prepare(`SELECT v.id,v.name,v.source_version,v.content_sha256,j.status,json_extract(j.target_json,'$.uploadId') upload_id,
    p.completeness,p.units_json,p.blocks_json FROM background_job j JOIN source_material_version v ON v.id=json_extract(j.target_json,'$.materialVersionId')
    LEFT JOIN material_parsing p ON p.id=(SELECT id FROM material_parsing WHERE source_material_version_id=v.id ORDER BY gmt_create DESC,id DESC LIMIT 1)
    WHERE j.work_item_id=? AND j.service_provider_id=? AND j.purpose='PARSE_MATERIAL'
      AND json_extract(j.target_json,'$.purpose')='PROVIDER_FORMAT' AND v.media_type=?
    ORDER BY v.gmt_create DESC,v.id DESC LIMIT 1`).bind(item.id,item.service_provider_id,XLSX)
    .first<{id:string;name:string;source_version:string;content_sha256:string;status:string;upload_id:string;completeness:string|null;units_json:string|null;blocks_json:string|null}>();
  if (!upload) return null;
  const result = { materialVersionId:upload.id, name:upload.name, status:upload.completeness ? 'READY' : ['READY','RUNNING','RETRY_WAIT'].includes(upload.status) ? 'PARSING' : 'BLOCKED', records:[] as AnalysisRecord[], issues:[] as string[], rows:[] as Record<string,string|null>[], fields:[] as string[] };
  if (!upload.completeness) { result.issues.push('最新上传的 Excel 尚未完成解析'); return result; }
  try {
    if (upload.completeness !== 'COMPLETE') throw Error('最新上传的 Excel 解析不完整，请查看文件问题后重新上传');
    const data = workbookRows(JSON.parse(upload.units_json!),JSON.parse(upload.blocks_json!));
    const cfg = await db.prepare('SELECT source_system,purpose,business_scope_key FROM integration_config WHERE id=? AND service_provider_id=?').bind(item.integration_config_id,item.service_provider_id).first<{source_system:string;purpose:string;business_scope_key:string}>();
    if (!cfg) throw Error('配置归属不存在');
    const schemaHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.fields))))].map(x=>x.toString(16).padStart(2,'0')).join('');
    // An uploaded sample of the declared schema must enable that schema for future
    // source records. Only genuinely new column sets receive a new format identity.
    const declared = sourceRecords.filter(r=>r.recordType==='PROVIDER_FORMAT').filter(r=>
      JSON.stringify(((r.data.fields ?? []) as {fieldKey:string}[]).map(f=>f.fieldKey).sort())===JSON.stringify(data.fields));
    const sameFormat = declared.length===1 ? declared[0] : null;
    const formatId = sameFormat?.sourceRecordId ?? `uploaded-xlsx-${schemaHash.slice(0,16)}`, formatVersion = sameFormat?.sourceVersion ?? 'header-v1';
    const existingFields = sourceRecords.filter(r=>r.recordType==='PROVIDER_FORMAT').flatMap(r=>(r.data.fields ?? []) as {fieldKey:string;label:string;meaning:string|null;unit:string|null}[]);
    const fields = data.fields.map(fieldKey => {
      const exact = existingFields.filter(f=>f.fieldKey===fieldKey && f.meaning);
      const inherited = exact.length===1 ? exact[0] : null;
      return {fieldKey,label:fieldKey,meaning:cfg.purpose==='INSTALLATION' ? INSTALLATION_FIELDS[fieldKey] ?? inherited?.meaning ?? null : inherited?.meaning ?? null,unit:inherited?.unit ?? null};
    });
    const format = {formatId,sourceVersion:formatVersion,notes:'人员上传 Excel；首行是原字段名，逐表保留实际数据。字段含义仅引用已有明确说明，未知含义保留待核实。',fields,sourceMaterials:[]};
    const sourceRecordId = `upload:${upload.upload_id}`;
    result.rows=data.rows;result.fields=data.fields;
    result.records=[
      {inputId:'uploaded-record',recordType:'PROVIDER_RECORD',sourceSystem:cfg.source_system,sourceRecordId,sourceVersion:upload.source_version,data:{
        sourceRecord:{sourceSystem:cfg.source_system,serviceProviderId:item.service_provider_id,sourceRecordId,sourceVersion:upload.source_version,purpose:'CONFIGURATION',configurationPurpose:cfg.purpose,businessScopeKey:cfg.business_scope_key,installationWorkOrderId:null,sourceFormatId:formatId,sourceFormatVersion:formatVersion},
        contentComplete:true,completeness:'COMPLETE',missingParts:[],formatStatus:'PROVIDED',rawJson:JSON.stringify({rows:data.rows}),formatDefinition:format,sourceMaterials:[],
        uploadedMaterial:{sourceSystem:'LOCAL_UPLOAD',materialVersionId:upload.id,name:upload.name,contentSha256:upload.content_sha256,rowPositions:data.positions},
      }},
      {inputId:'uploaded-format',recordType:'PROVIDER_FORMAT',sourceSystem:cfg.source_system,sourceRecordId:formatId,sourceVersion:formatVersion,data:format},
    ];
  } catch (error) { result.status='BLOCKED';result.issues.push((error as Error).message); }
  return result;
}
