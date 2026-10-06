import { BusinessItemsTablePage } from './workbench/BusinessItemsTablePage';

export default function IntegrationMappingsPage() {
  return <BusinessItemsTablePage kind="CONFIGURATION" title="接入映射配置" description="服务商在这里上传 Excel 安装明细，查看原列与标准字段的对应关系；京东可查看材料及映射结果。" />;
}
