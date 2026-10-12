import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export function normalizedPagesBase(value){
 if(typeof value!=='string'||!/^\/[A-Za-z0-9_-]+\/$/.test(value))throw Error('A single explicit repository base is required, for example /closit-planc/.');
 return value;
}

/** Deployment-only request boundary. Canonical repository asset URLs and hashes stay unchanged.
 * The static site cannot execute backend routes: these return an honest unavailable response.
 */
export function pagesBootstrap(base){
 normalizedPagesBase(base);
 return `(()=>{'use strict';const base=${JSON.stringify(base)};
const map=input=>{const value=String(input);let url;try{url=new URL(value,location.href);}catch{return value;}
if(url.origin!==location.origin)return value;
if(['/assets/','/fonts/','/vendor/'].some(prefix=>url.pathname.startsWith(prefix))||url.pathname==='/foreground-worker.js'){
url.pathname=base.slice(0,-1)+url.pathname;return url.href;}return value;};
Object.defineProperty(globalThis,'__CLOSIT_STATIC_DEMO__',{value:Object.freeze({base,storage:'browser-local',api:'unavailable'}),configurable:false});
const originalFetch=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>{
const raw=input instanceof Request?input.url:String(input);const url=new URL(raw,location.href);
if(url.origin===location.origin&&url.pathname.startsWith('/api/'))return Promise.resolve(new Response(JSON.stringify({error:{code:'backend_unavailable',message:'이 공유 주소는 브라우저 로컬 시연입니다. 실제 API·원격 저장 서버는 연결되어 있지 않습니다.'}}),{status:503,headers:{'Content-Type':'application/json'}}));
const mapped=map(raw);return originalFetch(input instanceof Request&&mapped!==raw?new Request(mapped,input):input instanceof Request?input:mapped,init);};
const setAttribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){
return setAttribute.call(this,name,/^(?:src|poster|href)$/i.test(name)?map(value):value);};
for(const[prototype,key]of[[HTMLImageElement.prototype,'src'],[HTMLMediaElement.prototype,'src'],[HTMLVideoElement.prototype,'poster'],[HTMLSourceElement.prototype,'src']]){
const d=Object.getOwnPropertyDescriptor(prototype,key);if(d?.set&&d.get)Object.defineProperty(prototype,key,{...d,set(value){d.set.call(this,map(value));}});}
if(globalThis.Worker){const OriginalWorker=globalThis.Worker;globalThis.Worker=new Proxy(OriginalWorker,{construct(target,args){return Reflect.construct(target,[map(args[0]),...args.slice(1)]);}});}
})();`;
}

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function buildPages({base,run=spawnSync}={}){
 base=normalizedPagesBase(base);
 const outDir=path.join(project,'dist-pages');
 if(path.dirname(outDir)!==project||path.basename(outDir)!=='dist-pages')throw Error('Unexpected output directory.');
 for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--base',base,'--outDir','dist-pages']]){
  const result=run(process.execPath,args,{cwd:project,stdio:'inherit'});if(result.status!==0)throw Error('Pages build failed; no deployment was performed.');
 }
 // These local-only reference/checkpoint helpers are not part of the public runnable demo.
 for(const relative of ['local-reference','local-checkpoint.html']){
  const target=path.resolve(outDir,relative);if(!target.startsWith(outDir+path.sep))throw Error('Unsafe output exclusion.');
  if(fs.existsSync(target))fs.rmSync(target,{recursive:true,force:false});
 }
 const bootstrapName='pages-runtime.js';fs.writeFileSync(path.join(outDir,bootstrapName),pagesBootstrap(base));
 const htmlPath=path.join(outDir,'index.html'),html=fs.readFileSync(htmlPath,'utf8');
 if(!html.includes('<head>'))throw Error('HTML head was not found.');
 fs.writeFileSync(htmlPath,html.replace('<head>',`<head>\n<script src="${base}${bootstrapName}"></script>`));
 // Worker-global importScripts/MediaPipe URLs do not run in the window request boundary.
 const workerPath=path.join(outDir,'foreground-worker.js');
 if(fs.existsSync(workerPath)){const worker=fs.readFileSync(workerPath,'utf8');fs.writeFileSync(workerPath,worker.replace(/(['"`])\/(vendor|assets|fonts)\//g,`$1${base}$2/`));}
 fs.writeFileSync(path.join(outDir,'.nojekyll'),'');
 fs.writeFileSync(path.join(outDir,'DEPLOYMENT_MODE.json'),JSON.stringify({mode:'browser-local-static-demo',base,api:'unavailable',remoteWrites:false,paidCalls:false,localStateUploaded:false},null,2)+'\n');
 return {outDir,base,mode:'browser-local-static-demo'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const i=process.argv.indexOf('--base');const result=buildPages({base:i>=0?process.argv[i+1]:undefined});console.log(JSON.stringify(result));
}
