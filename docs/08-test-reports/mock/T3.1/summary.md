# T3.1 实现可重复故障与配对环境恢复工具 — 验证证据

> 执行时间：2026-09-20｜执行人：AI｜环境：mock-env-a（8790）+ mock-env-b（8792，同数据集）实跑

## 交付物
- `code/mocks/control/faults.ts`：故障控制单（route/phase/times/httpOverride/命中日志，持久化于 identity 来源库）
- `code/mocks/control/environment-manager.ts`：环境登记、恢复协调器、上传环境保护、迟到任务拒绝
- `code/mocks/control/application-lifecycle.ts`：本系统生命周期适配器探测（未配置=未就绪）
- server.ts：四类故障注入点（调用前/写入后丢响应/回查失败/源成功本地接续标记）+ 控制入口
- `code/mocks/tests/faults-environments.test.ts`：18 项真实 HTTP 断言（自清理，可重复执行）

## 逐断言结果（18 项全过 + 重启探针）
- BEFORE_CALL：50301 且来源写计数不变；命中 1 次后同编号真实写入恢复
- AFTER_WRITE_LOST_RESPONSE：50401 但来源实际写入（计数 +1）；回查证实 SUCCEEDED（没有收到响应≠没有写入）；同编号恢复不二次写入
- RECHECK_FAIL：50301 后解除恢复读取已保存结果；按登记条件 clear 后请求正常；对照接口无误伤
- LOCAL_CONTINUATION：来源保留成功回执并标记 x-mock-continuation-blocked（本系统恢复只续本地流程的钩子）
- 重启探针：故障单进程重启后仍 active（remaining 5→命中 504→remaining 4，命中日志留痕）
- 环境隔离：A 修订 REC-2609-0004，B 库同编号仍为 receivable-1 且无修订（同业务编号互不污染）
- 恢复协调器：未配置生命周期适配器 → 40903 明确拒绝且无半成品目录（不做来源单边清空）；含上传环境 → 40901 拒绝清空；旧环境迟到任务 → 40901 拒绝写新环境

边界：真实应用级恢复验收（空库+接口导入+切换）待 T4.2；适配器接口已实现探测与调用骨架。
