import { useEffect, useRef, useState } from 'react';
import { useApiData, fmtTime } from '../../hooks';
import { errorKind, getMaterialVersion, materialContentUrl } from '../../api';
import { Skeleton, StateView } from '../../components/PageShell';

export function EvidenceSidebar({ materialVersionId, blockId, onClose }: { materialVersionId: string; blockId?: string; onClose: () => void }) {
  const [versionId, setVersionId] = useState(materialVersionId);
  const [state, retry] = useApiData(() => getMaterialVersion(versionId), [versionId]);

  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === 'ready') highlighted.current?.scrollIntoView({ block: 'center' });
  }, [state.status, blockId]);

  return (
    <aside className="evidence-sidebar">
      <div className="sidebar-header">
        <strong>原始证据</strong>
        <button className="btn-link" onClick={onClose}>关闭</button>
      </div>
      {state.status === 'loading' && <Skeleton lines={4} />}
      {state.status === 'failed' && (
        <StateView kind={errorKind(state.error) === 'NOT_FOUND' ? 'not-found' : errorKind(state.error) === 'FORBIDDEN' ? 'forbidden' : 'unavailable'} onRetry={retry} />
      )}
      {state.status === 'ready' && (
        <div>
          <div className="sidebar-meta">
            <p>{blockId && <span className="tag">定位段落 {blockId}</span>}</p><p><strong>{state.data.name ?? '（文件名未取得）'}</strong></p>
            <p className="state-desc">
              来源版本 {state.data.sourceVersion ?? '未知'} · {state.data.mediaType ?? '类型未知'} · {state.data.byteLength !== null ? `${state.data.byteLength} 字节` : '大小未知'}
            </p>
            {state.data.versions && state.data.versions.length > 1 && (
              <label className="state-desc">
                版本切换：
                <select value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                  {state.data.versions.map((v) => (
                    <option key={v.materialVersionId} value={v.materialVersionId}>{v.sourceVersion ?? v.materialVersionId}</option>
                  ))}
                </select>
              </label>
            )}
            {state.data.readState === 'REFERENCED' && <p className="tag tag-blocked">原文未取得，仅登记来源引用</p>}
          </div>

          {state.data.readState === 'VERIFIED' && state.data.mediaType && (
            <div className="sidebar-content">
              {state.data.mediaType === 'application/pdf' && (
                <iframe title="原文预览" src={materialContentUrl(versionId)} className="content-frame" />
              )}
              {state.data.mediaType.startsWith('image/') && (
                <img alt="原文图片" src={materialContentUrl(versionId)} className="content-image" />
              )}
              {state.data.mediaType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && (
                <a className="btn-primary" href={materialContentUrl(versionId)} download>下载 XLSX 原文件</a>
              )}
            </div>
          )}

          {state.data.parsing && (
            <div className="sidebar-parsing">
              <p className="state-desc">解析：{state.data.parsing.completeness === 'COMPLETE' ? '完整' : '不完整'}</p>
              {state.data.parsing.issues.length > 0 && (
                <ul className="issue-list">
                  {state.data.parsing.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                </ul>
              )}
              {state.data.parsing.units.map((u) => (
                <div key={u.unitId} className="parse-unit">
                  <p className="state-desc">{u.kind}{u.name ? ` · ${u.name}` : ''}</p>
                  {state.data.parsing!.blocks.filter((b) => b.unitId === u.unitId).map((b) => (
                    <div key={b.blockId} ref={b.blockId === blockId ? highlighted : undefined} className={`parse-block ${b.blockId === blockId ? "evidence-highlight" : ""}`}>
                      {b.kind === 'IMAGE_DESCRIPTION' && <span className="tag">图片描述</span>}
                      {b.cellRange && <span className="tag">{b.cellRange}</span>}
                      <span>{b.text ?? '（无文本内容）'}</span>
                    </div>
                  ))}
                </div>
              ))}
              {state.data.parsing.blocks.length === 0 && <p className="state-desc">文件内容为空</p>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
