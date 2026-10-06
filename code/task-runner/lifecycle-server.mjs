#!/usr/bin/env node
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {LocalLifecycle} from './lifecycle-runtime.mjs';
import {PROTOCOL} from './lifecycle-state.mjs';

export async function startLifecycleServer({port=18980}={}){
 if(!Number.isInteger(port)||port<1024||port>65535||[8788,8790].includes(port))throw Error('A separate unprivileged localhost management port is required');
 const manager=await new LocalLifecycle().initialize();
 manager.baseUrl=`http://127.0.0.1:${port}`;
 const server=createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({protocol:PROTOCOL,...data}));};
  if(req.headers.origin)return send(403,{ok:false,error:'Browser cross-origin lifecycle commands are refused'});
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(req.method==='GET'&&url.pathname==='/lifecycle/status')return send(200,manager.status());
   if(req.method==='POST'&&url.pathname.startsWith('/lifecycle/')){
    if(manager.busy)return send(409,{ok:false,error:'A lifecycle operation is already running'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{ok:false,error:'application/json required'});
    const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>8192)throw Error('Lifecycle body too large');chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString());
    const action=url.pathname.slice('/lifecycle/'.length),methods={'provision':'provision','verify-import':'verifyImport',activate:'activate',restore:'restore',pause:'pause',resume:'resume','run-once':'runOnce'};
    if(!methods[action])return send(404,{ok:false,error:'Unknown lifecycle operation'});
    manager.busy=true;try{const data=await manager[methods[action]](body);return send(200,{ok:true,envId:body.envId,data});}finally{manager.busy=false;}
   }
   // Stable test entry. Workers and task processes retain immutable per-environment URLs.
   if(url.pathname.startsWith('/api/')){
    const id=manager.registry.state.activeEnvId;if(!id||manager.entry(id).status!=='ACTIVE')return send(503,{ok:false,error:'No verified active environment'});
    const target=manager.entry(id).workerUrl+url.pathname+url.search;
    let body;if(!['GET','HEAD'].includes(req.method)){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw Error('Request exceeds local proxy limit');chunks.push(chunk);}body=Buffer.concat(chunks);}
    const response=await fetch(target,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','transfer-encoding','content-length'].includes(k))),body,redirect:'manual'});
    res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>!['transfer-encoding','content-length','content-encoding'].includes(k))));res.end(Buffer.from(await response.arrayBuffer()));return;
   }
   return send(404,{ok:false,error:'Unknown lifecycle route'});
  }catch(error){send(409,{ok:false,error:error.message});}
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await manager.close();throw error;}
 const close=async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await manager.close();};
 return {server,manager,close,baseUrl:`http://127.0.0.1:${port}`};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.includes('--help'))console.log('node code/task-runner/lifecycle-server.mjs [--port 18980]\nOwns only code/mocks/.data/lifecycle-managed. POST /lifecycle/provision, /verify-import, /activate or /restore. See docs/09-deploy/04-local-lifecycle.md.');
 else{const i=process.argv.indexOf('--port');const server=await startLifecycleServer({port:i<0?18980:Number(process.argv[i+1])});console.log(JSON.stringify({protocol:PROTOCOL,baseUrl:server.baseUrl,storage:server.manager.root}));let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await server.close();process.exit(0);});}
}
