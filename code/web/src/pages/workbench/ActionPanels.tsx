import { type PanelProps } from './ActionShared';
import { PreparationPanel } from './PreparationPanel';
import { ReviewPanel } from './ReviewPanel';
import { ReconciliationPanel } from './ReconciliationPanel';
import { ConfigurationPanel } from './ConfigurationPanel';
import { CoordinationPanel } from './CoordinationPanel';
export function ActionPanels(props: PanelProps) {
  return <div>
    {props.item.kind === 'INSTALLATION_PREPARATION' && <PreparationPanel {...props} />}
    {props.item.kind === 'INSTALLATION_REVIEW' && <ReviewPanel {...props} />}
    {props.item.kind === 'RECONCILIATION' && <ReconciliationPanel {...props} />}
    {props.item.kind === 'CONFIGURATION' && <ConfigurationPanel {...props} />}
    <CoordinationPanel {...props} />
  </div>;
}
