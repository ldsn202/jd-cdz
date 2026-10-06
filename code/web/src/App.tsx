import { roleSummary } from './labels';
import { useRoute, navigate } from './router';
import { useSession } from './session';
import { Skeleton, StateView } from './components/PageShell';
import { AccountSwitcher } from './components/AccountSwitcher';
import HomePage from './pages/home';
import WorkItemsPage from './pages/work-items';
import WorkItemDetailPage from './pages/work-item-detail';
import InstallationOrdersPage from './pages/installation-orders';
import InstallationOrderDetailPage from './pages/installation-order-detail';
import BillingOrdersPage from './pages/billing-orders';
import BillingComparePage from './pages/billing-compare';
import CoordinationPage from './pages/coordination';
import ExceptionsPage from './pages/exceptions';
import IntegrationMappingsPage from './pages/integration-mappings';
import IntegrationFormatEditPage from './pages/integration-format-edit';
import IntegrationChangeHistoryPage from './pages/integration-change-history';

const NAV: { group: string; items: { path: string; label: string }[] }[] = [
  { group: '工作台', items: [{ path: '/', label: '首页' }, { path: '/work-items', label: '处理事项' }] },
  { group: '安装', items: [{ path: '/installation/orders', label: '安装工单' }] },
  { group: '对账', items: [{ path: '/billing/orders', label: '业务对账' }] },
  { group: '履约', items: [{ path: '/coordination', label: '履约协同' }, { path: '/exceptions', label: '本地异常' }] },
  {
    group: '接入配置',
    items: [
      { path: '/integration/mappings', label: '映射配置' },
      { path: '/integration/change-history', label: '变更历史' },
    ],
  },
];

const NAV_ICONS: Record<string, string> = {
  '/': 'M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10',
  '/work-items': 'M8 4h8v4H8zM8 6H5v15h14V6h-3M8 12h8M8 16h5',
  '/installation/orders': 'M14 4a5 5 0 0 0-6 6L3 15l6 6 5-5a5 5 0 0 0 6-6l-4 3-5-5z',
  '/billing/orders': 'M4 5h16v15H4zM4 10h16M10 10v10M15 10v10',
  '/coordination': 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 5 5',
  '/exceptions': 'M12 3 2 21h20zM12 9v5M12 17v1',
  '/integration/mappings': 'M4 5h6v6H4zM14 14h6v6h-6zM14 5h6v6h-6zM7 11v6h7',
  '/integration/change-history': 'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',
};

function RouteOutlet() {
  const route = useRoute();
  if (!route) return <StateView kind="not-found" />;
  switch (route.name) {
    case 'home':
      return <HomePage />;
    case 'work-items':
      return <WorkItemsPage />;
    case 'work-item-detail':
      return <WorkItemDetailPage />;
    case 'installation-orders':
      return <InstallationOrdersPage />;
    case 'installation-order-detail':
      return <InstallationOrderDetailPage />;
    case 'billing-orders':
      return <BillingOrdersPage />;
    case 'billing-receivable':
    case 'billing-compare':
      return <BillingComparePage />;
    case 'coordination':
      return <CoordinationPage />;
    case 'exceptions':
      return <ExceptionsPage />;
    case 'integration-mappings':
      return <IntegrationMappingsPage />;
    case 'integration-format-edit':
      return <IntegrationFormatEditPage />;
    case 'integration-change-history':
      return <IntegrationChangeHistoryPage />;
    default:
      return <StateView kind="not-found" />;
  }
}

export default function App() {
  const session = useSession();
  useRoute();
  const rawPath = window.location.hash.replace(/^#/, '') || '/';
  const path = rawPath === '/billing/work-orders' ? '/billing/orders' : rawPath;
  const active = NAV.flatMap(g => g.items).filter(it => it.path === '/' ? path === '/' : path.startsWith(it.path)).at(-1);
  if (session.status === 'loading') {
    return (
      <div className="boot-wrap">
        <Skeleton lines={5} />
      </div>
    );
  }
  if (session.status === 'failed') {
    return (
      <div className="boot-wrap">
        <StateView kind="unauthenticated" message={session.message} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <button className="brand" onClick={() => navigate('/')} aria-label="京东充电桩工作台">
          <span className="brand-mark">JD</span><span><strong>京东充电桩</strong><small>INSTALLATION WORKSPACE</small></span>
        </button>
        <div className="workspace-label">安装信息管理平台</div>
        <nav className="app-nav" aria-label="主导航">
          {NAV.map((g) => <div key={g.group} className="nav-group">
            <p className="nav-group-title">{g.group}</p>
            {g.items.map((it) => <button key={it.path} onClick={() => navigate(it.path)} className={`nav-item ${active?.path === it.path ? 'active' : ''}`} aria-current={active?.path === it.path ? 'page' : undefined}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={NAV_ICONS[it.path]}/></svg>{it.label}
            </button>)}
          </div>)}
        </nav>
        <div className="sidebar-footer"><strong>安装 · 对账 · 履约</strong><span>业务处理工作区</span></div>
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="breadcrumb">工作区 <span>/</span> <strong>{active?.label ?? '事项详情'}</strong>{path.startsWith('/work-items/') && <><span>/</span>事项详情</>}</div>
          <div className="app-identity"><span className="avatar">{session.session.displayName.slice(0, 1)}</span><div>{session.session.displayName}<small>{roleSummary(session.session.businessRoles)}</small></div>{session.session.accountSwitchingAvailable && <AccountSwitcher identityId={session.session.identityId} />}</div>
        </header>
        <main className="app-main"><RouteOutlet /></main>
      </div>
    </div>
  );
}
