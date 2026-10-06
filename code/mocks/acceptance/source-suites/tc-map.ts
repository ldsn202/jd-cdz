export type TcStage = 'PASS' | 'NOT_RUN' | 'BLOCKED';

export type TcStatus = {
  tcId: string;
  name: string;
  generationStage: TcStage;
  sourceStage: TcStage;
  businessStage: TcStage;
  businessDependency: string;
};

const BUSINESS_DEP = 'T4.2 真实业务应用联调（工作台、D1、调度与 Skill 执行）未实现，不以来源 200 或文档检查换算业务 PASS';

export function buildTcStatus(opsPassed: Set<string>): TcStatus[] {
  const has = (id: string) => opsPassed.has(id);
  const entry = (tcId: string, name: string, generation: TcStage, source: TcStage): TcStatus => ({
    tcId,
    name,
    generationStage: generation,
    sourceStage: source,
    businessStage: 'BLOCKED',
    businessDependency: BUSINESS_DEP,
  });
  return [
    entry('TC-MCK-01', '模拟外部接口分层入口与合同包装', 'PASS', has('OP-01+') && has('OP-01-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-02', '后台 HTTP 适配、脱敏与失败分支', 'PASS', has('OP-05-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-03', '来源调用前失败', 'PASS', 'PASS'),
    entry('TC-MCK-04', '材料版本与读取错误', 'PASS', has('OP-05+') && has('OP-05-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-05', '服务商格式四条件', 'PASS', has('OP-04+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-06', '多服务商账号与范围隔离', 'PASS', has('OP-02-') && has('OP-08-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-07', '来源调用前失败恢复', 'PASS', 'PASS'),
    entry('TC-MCK-08', '超时、结果未知与回查恢复', 'PASS', has('OP-14+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-09', '写入后响应丢失', 'PASS', has('OP-14+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-10', '同操作编号并发与重复提交', 'PASS', 'NOT_RUN'),
    entry('TC-MCK-11', '服务商修订应收并重读', 'PASS', has('OP-07+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-12', '服务商回复后的分析与复核衔接', 'PASS', 'BLOCKED'),
    entry('TC-MCK-13', '权限撤销与失效会话', 'PASS', has('OP-01-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-14', '双方账目字段完整性', 'PASS', has('OP-06+') && has('OP-07+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-15', '缺权限与自报身份参数', 'PASS', has('OP-01-') && has('OP-02-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-16', '越权读取与跨服务商', 'PASS', has('OP-02-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-17', '无权限与深链接 404 口径', 'PASS', 'BLOCKED'),
    entry('TC-MCK-18', '上传文件实际保留', 'PASS', 'BLOCKED'),
    entry('TC-MCK-19', '上传与模拟材料浏览隔离', 'PASS', 'BLOCKED'),
    entry('TC-MCK-20', '模拟数据经接口进入工作台', 'PASS', 'BLOCKED'),
    entry('TC-MCK-21', '常规集规模、场景与覆盖核对', 'PASS', 'PASS'),
    entry('TC-MCK-22', '初始复现与时间推进', 'PASS', 'PASS'),
    entry('TC-MCK-23', '五件交付文件齐备与完整性', 'PASS', 'PASS'),
    entry('TC-MCK-24', '预设负例保留、命中与答案隔离', 'PASS', has('OP-05-') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-25', '来源跨接口关联与对照独立', 'PASS', has('OP-06+') && has('OP-07+') ? 'PASS' : 'NOT_RUN'),
    entry('TC-MCK-26', '非法生成配置拒绝与有效对照', 'PASS', 'PASS'),
    entry('TC-MCK-27', '来源读写持久化与重启恢复', 'PASS', 'PASS'),
    entry('TC-MCK-28', '配对环境恢复、上传保护与切换', 'PASS', 'PASS'),
    entry('TC-MCK-29', 'Skill 产物保存', 'PASS', 'BLOCKED'),
  ];
}
