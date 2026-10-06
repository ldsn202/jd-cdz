// T5.1: consume the persisted original request; recovery is GET-only.
import { createExternalClient,externalPost } from '../api/src/services/external/index.ts';

export async function executeExternal(target, env, readMaterial) {
  // The account comes only from the persisted, authorized human decision.
  // The service runner executes it; it receives no human decision permissions.
  const executionEnv=env.EXTERNAL_MODE==='mock'&&target.actorAccountId?{...env,MOCK_ACCOUNT_ID:target.actorAccountId}:env;
  const client = createExternalClient(executionEnv);
  const { installationWorkOrderId: orderId, operationId, request, queryOnly, interfaceKind } = target;
  if (!orderId || !operationId || !request) throw new Error('外部操作缺少原始请求或操作编号');
  if(!queryOnly && target.localMaterials?.length){
    if(env.EXTERNAL_MODE!=='mock'||!readMaterial)throw new Error('本地上传材料尚未配置原系统文件传输');
    for(const material of target.localMaterials){
      const bytes=Buffer.from(await readMaterial(material.materialVersionId));
      await externalPost(executionEnv,`/api/admin/mock/external/installation/work-orders/${encodeURIComponent(orderId)}/uploaded-materials`,{
        ...material,contentBase64:bytes.toString('base64')});
    }
  }
  if (interfaceKind === 'INSTALLATION_SUBMIT') {
    if (request.submissionId !== operationId) throw new Error('提交编号与原操作不一致');
    return queryOnly
      ? client.installationSubmit.getSubmission(orderId, operationId)
      : client.installationSubmit.submit(orderId, request);
  }
  if (interfaceKind === 'REVIEW_SYNC') {
    if (request.operationId !== operationId) throw new Error('审核编号与原操作不一致');
    return queryOnly
      ? client.reviewSync.getAction(orderId, operationId)
      : client.reviewSync.postAction(orderId, request);
  }
  throw new Error(`不支持的外部操作类型：${interfaceKind}`);
}
