import type { ReactNode } from 'react';

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div aria-label="加载中">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function StateView({ kind, message, onRetry }: { kind: 'not-found' | 'forbidden' | 'unavailable' | 'conflict' | 'unauthenticated'; message?: string; onRetry?: () => void }) {
  const text = {
    'not-found': { title: '页面不存在或记录在当前范围内不可见', desc: '请从列表进入；若通过链接打开，确认该记录仍在你的授权范围内。' },
    forbidden: { title: '当前身份无法访问该内容', desc: '该内容不在你的职责范围内，不显示为空页面。' },
    unavailable: { title: '暂时无法取得数据', desc: '服务暂时不可用，已取得的内容会保留，可稍后重试。' },
    conflict: { title: '处理状态已变化', desc: '该记录正在被处理或版本已更新，请刷新后再继续。' },
    unauthenticated: { title: '无法核实当前身份', desc: '当前身份核实失败或会话已失效，请按登录流程恢复后重试。' },
  }[kind];
  return (
    <div className="panel panel-center">
      <p className="state-title">{text.title}</p>
      <p className="state-desc">{message ?? text.desc}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">
          重试
        </button>
      )}
    </div>
  );
}

export function PageShell({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h2 className="page-title">{title}</h2>
      {children ?? (
        <div className="panel">
          <Skeleton />
        </div>
      )}
    </div>
  );
}
