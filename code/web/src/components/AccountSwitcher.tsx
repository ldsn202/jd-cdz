import { useEffect, useRef, useState } from 'react';
import { getSwitchableAccounts, switchAccount, type SwitchableAccount } from '../api';
import { ROLE_LABEL, roleSummary } from '../labels';
import { reloadForAccountChange } from '../session';

export function AccountSwitcher({ identityId }: { identityId: string }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SwitchableAccount[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    let cancelled = false;
    setLoading(true); setError(''); setQuery('');
    getSwitchableAccounts().then(({ list }) => {
      if (!cancelled) setAccounts(list);
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : '账号列表读取失败');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  async function select(account: SwitchableAccount) {
    if (pending || account.identityId === identityId) return;
    setPending(account.accountId); setError('');
    try {
      await switchAccount(account.accountId);
      reloadForAccountChange(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换失败，请重试');
      setPending('');
    }
  }
  const visible = accounts.filter(account => [account.displayName, account.accountId, ...account.businessRoles.map(role => ROLE_LABEL[role] ?? role)].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <button className="btn-secondary account-switch-trigger" onClick={() => setOpen(true)}>切换账号</button>
    {open && <dialog ref={dialog} className="account-dialog" aria-labelledby="account-switch-title"
      onCancel={e => { e.preventDefault(); if (!pending) setOpen(false); }}
      onClick={e => { if (e.target === e.currentTarget && !pending) setOpen(false); }}>
      <div className="account-dialog-content">
        <div className="account-dialog-heading"><h2 id="account-switch-title">切换账号</h2><button className="btn-secondary" disabled={!!pending} onClick={() => setOpen(false)} aria-label="关闭账号选择">关闭</button></div>
        <p className="account-dialog-hint">切换后返回首页，按所选账号的权限显示数据。未提交的内容不会保留。</p>
        <label className="account-search">查找账号<input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="输入账号名称、角色或服务商编号" disabled={!!pending} /></label>
        {error && <p className="account-switch-error" role="alert">{error}</p>}
        <div className="account-options" aria-busy={loading || !!pending}>
          {loading ? <p className="account-dialog-hint">正在读取账号…</p> : visible.length === 0 ? <p className="account-dialog-hint">没有符合条件的账号</p> : visible.map(account => <button key={account.accountId} className="account-option" disabled={!!pending || account.identityId === identityId} onClick={() => select(account)}>
            <span><strong>{account.displayName}</strong><small>{roleSummary(account.businessRoles)} · {account.accountId}</small></span>
            <span className="account-option-status">{account.identityId === identityId ? '当前账号' : pending === account.accountId ? '切换中…' : '切换'}</span>
          </button>)}
        </div>
      </div>
    </dialog>}
  </>;
}
