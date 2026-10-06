import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvironment } from '../../src/environment/registry.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

const SCENARIO_EXPECTATIONS: Record<string, {
  name: string;
  interfaces: string[];
  operations: string[];
  mutableSources: string;
  immutableSources: string;
  expectedResult: string;
}> = {
  pending_materials: {
    name: '待整理安装资料',
    interfaces: ['身份权限', '工单上下文', '购买订单与安装权益', '服务商原资料及格式', '原始文件'],
    operations: ['后台读取工单上下文（明细 NOT_SUBMITTED 为正常阶段）', '读取权益与原资料', '实际解析材料文件', '形成整理草稿', '人员确认后提交正式明细', '回查提交结果'],
    mutableSources: '原安装管理系统：审核及补充动作、正式明细（提交后新增）',
    immutableSources: '方案、购买订单、权益、原始材料文件及其版本',
    expectedResult: '草稿来自实际解析，不得以方案量充当实际量；提交成功后来源保存正式明细并可按原编号回查；缺项保持缺项',
  },
  evidence_consistent: {
    name: '安装证据一致',
    interfaces: ['身份权限', '工单上下文', '原始文件', '计费条款与批准记录', '核查决定与补充记录同步'],
    operations: ['读取方案/正式明细/材料', '实际解析原文并比对', '形成支持证据', '核查人决定通过', '同步核查决定并回查'],
    mutableSources: '原安装管理系统：审核动作记录',
    immutableSources: '方案、正式明细、材料文件、京东账单',
    expectedResult: '证据指向原文位置；通过决定真实写入并可回查；COMPLETE 不替代人工决定',
  },
  quantity_diff: {
    name: '安装数量差异',
    interfaces: ['身份权限', '工单上下文', '原始文件', '核查决定与补充记录同步'],
    operations: ['读取方案与正式明细', '定位数量差异', '检查变更依据材料是否存在', '有依据→核实后决定；无依据→退回补充', '服务商回复后继续原事项'],
    mutableSources: '原安装管理系统：审核及补充动作、补充材料版本',
    immutableSources: '方案量与实际量原值（分别保留）',
    expectedResult: '方案量/实际量分别保留不互相覆盖；无变更依据不得按有依据通过；回复准确指向原退回动作',
  },
  material_lacking: {
    name: '安装材料不足',
    interfaces: ['身份权限', '工单上下文', '原始文件'],
    operations: ['读取材料索引', '发现必需材料实际缺失', '保持业务缺项进入核查处理'],
    mutableSources: '原安装管理系统：补充动作（后续）',
    immutableSources: '现有材料索引与文件版本',
    expectedResult: '必需材料缺失作为业务缺项保留，不得以未提交明细冒充缺项、不得以其他材料补齐',
  },
  billing_matched: {
    name: '双方账目可核对一致',
    interfaces: ['身份权限', '京东账单', '服务商应收', '计费条款与批准记录'],
    operations: ['分别读取双方账单', '读取条款与批准', '程序按已确认对应关系比较', '一致后按流程处理'],
    mutableSources: '服务商应收系统：修订（后续场景）',
    immutableSources: '京东账单原金额与版本、条款原文',
    expectedResult: '范围/分项/币种/口径对应且金额一致才形成核对一致；总额一致但分项不一致不得判一致；金额精确十进制比较',
  },
  billing_diff: {
    name: '双方账目存在差异',
    interfaces: ['身份权限', '京东账单', '服务商应收', '计费条款与批准记录'],
    operations: ['分别读取双方账单', '程序定位差额与拆合项/单列费用', '发起核实', '服务商修订应收', '重读新版再比较'],
    mutableSources: '服务商应收系统：修订版本与说明',
    immutableSources: '京东账单（服务商修订不得改变京东侧）',
    expectedResult: '两侧原记录独立保留；修订产生新版本并接续原事项；单靠金额相等不完成对账',
  },
  billing_evidence_incomplete: {
    name: '对账依据未取得完整',
    interfaces: ['身份权限', '京东账单', '服务商应收', '计费条款与批准记录'],
    operations: ['读取双方账单', '查询条款与批准', '确认查询完整但未取得记录或查询范围不足', '按缺项类型进入核实'],
    mutableSources: '计费依据系统：补充批准记录（后续）',
    immutableSources: '双方账单原记录',
    expectedResult: '无批准记录与批准查询未查全分别表示；未查全不得解释为没有批准',
  },
  coordination: {
    name: '履约协调',
    interfaces: ['身份权限', '工单上下文'],
    operations: ['读取履约阻碍事实', '本系统按业务规则建立事项', '保存进展/完成协同'],
    mutableSources: '原安装管理系统：工单状态（协同结果后续）',
    immutableSources: '工单及关联记录',
    expectedResult: '事项来自真实履约事实；进展留痕；完成协同不自动通过安装审核或改动账单',
  },
  read_only: {
    name: '工单只读查看',
    interfaces: ['身份权限', '工单上下文'],
    operations: ['读取工单与授权范围', '查看不办理'],
    mutableSources: '无',
    immutableSources: '全部来源记录',
    expectedResult: '可读且不产生新事项；越权读取其他服务商记录被拒绝',
  },
};

function main(): void {
  const envFile = arg('--env');
  const datasetId = arg('--dataset');
  if (!envFile || !datasetId) throw new Error('用法：node acceptance/expected/build-expectations.ts --env <环境清单.json> --dataset <datasetId>');
  const env = loadEnvironment(rootDir, envFile);
  const deliveryDir = path.join(env.storageDir, 'delivery', datasetId);
  const manifest = JSON.parse(readFileSync(path.join(deliveryDir, 'data-manifest.json'), 'utf8'));
  const fileManifest = JSON.parse(readFileSync(path.join(deliveryDir, 'file-manifest.json'), 'utf8'));
  const negatives = JSON.parse(readFileSync(path.join(deliveryDir, 'negatives.json'), 'utf8')).items as any[];

  const expectations = Object.entries(SCENARIO_EXPECTATIONS).map(([key, e]) => {
    const orderIds = (manifest.scenarioOrderIds as Record<string, string[]>)[key] ?? [];
    const samples = orderIds.slice(0, 3).map((id) => ({
      installationWorkOrderId: id,
      initialVersion: 'work-order-1',
      materialFiles: fileManifest.files.filter((f: any) => f.installationWorkOrderId === id).map((f: any) => ({ fileId: f.fileId, version: f.sourceVersion, sha256: f.sha256 })),
    }));
    return {
      scenarioKey: key,
      scenarioName: e.name,
      objectCount: orderIds.length,
      sourceObjects: `data-manifest.scenarioOrderIds.${key} 全部 ${orderIds.length} 个对象，初始版本 work-order-1；示例绑定见 samples`,
      samples,
      interfaces: e.interfaces,
      operationOrder: e.operations,
      mutableSources: e.mutableSources,
      immutableSources: e.immutableSources,
      expectedSystemResult: e.expectedResult,
      evidencePosition: 'docs/08-test-reports/ 对应用例执行报告；来源前后值经各外部接口取得',
      recheckMethod: '按原操作编号/原记录编号经对应外部接口回查；文件按 sha256 复核；金额按精确十进制复算',
    };
  });

  const negativeExpectations = [
    ...negatives.map((n: any) => ({
      negativeId: n.negativeId,
      kind: n.kind,
      target: n.targetDescription,
      installationWorkOrderId: n.installationWorkOrderId,
      expectedHandling: n.expectedHandling,
      recheckMethod: '经对应外部接口读取该对象，逐字段对照本预期；不得为通过测试把负例修成正常数据',
    })),
    ...(fileManifest.negatives as any[]).map((n: any) => ({
      negativeId: n.negativeId,
      kind: n.kind,
      target: `文件 ${n.fileId}（对照 ${n.counterpartFileId}）`,
      installationWorkOrderId: n.installationWorkOrderId,
      expectedHandling: n.expectedHandling,
      recheckMethod: '按 file-manifest 登记 sha256 复核实际字节；解析结果必须命中预期失败/缺项',
    })),
  ];

  const doc = {
    datasetId,
    frozenAt: new Date().toISOString(),
    note: '独立验收预期在输入前冻结；本文件与场景标签不得被来源业务响应或 Skill 输入读取（存放于交付目录，独立于来源存储）。HTTP 200 不单独构成业务成功。',
    expectations,
    negativeExpectations,
  };
  mkdirSync(deliveryDir, { recursive: true });
  const out = path.join(deliveryDir, 'scenario-expectations.json');
  if (existsSync(out)) throw new Error('预期文件已存在，预期冻结后不重写；需新数据集或显式恢复');
  writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(JSON.stringify({ datasetId, scenarios: expectations.length, negatives: negativeExpectations.length, out }, null, 2));
}

main();
