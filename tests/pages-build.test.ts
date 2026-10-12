import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
// @ts-expect-error deployment script has no runtime import in the application
import {normalizedPagesBase,pagesBootstrap} from '../scripts/build-pages.mjs';

test('Pages output requires an explicit single safe repository prefix',()=>{
 assert.equal(normalizedPagesBase('/closit-plan-c/'),'/closit-plan-c/');
 for(const bad of ['/',undefined,'https://elsewhere.invalid/','//repo/','/a/../b/','/repo name/','/repo/?x=1','/nested/repo/'])assert.throws(()=>normalizedPagesBase(bad));
});

function sandbox(){
 const fetched:string[]=[],attributes:{name:string;value:string}[]=[],workers:string[]=[];
 class Element{setAttribute(name:string,value:string){attributes.push({name,value});}}
 class HTMLImageElement extends Element {value='';get src(){return this.value;}set src(value:string){this.value=value;}}
 class HTMLMediaElement extends Element {value='';get src(){return this.value;}set src(value:string){this.value=value;}}
 class HTMLVideoElement extends HTMLMediaElement {p='';get poster(){return this.p;}set poster(value:string){this.p=value;}}
 class HTMLSourceElement extends Element {value='';get src(){return this.value;}set src(value:string){this.value=value;}}
 class Worker{constructor(url:string){workers.push(url);}}
 const context=vm.createContext({URL,Request,Response,location:{href:'https://example.github.io/closit-plan-c/',origin:'https://example.github.io'},
  Element,HTMLImageElement,HTMLMediaElement,HTMLVideoElement,HTMLSourceElement,Worker,fetch:async(input:string|Request)=>{fetched.push(input instanceof Request?input.url:input);return new Response('ok');}});
 vm.runInContext(pagesBootstrap('/closit-plan-c/'),context);
 return{context,fetched,attributes,workers,Element,HTMLImageElement};
}

test('canonical URLs map only at fetch/image/worker boundaries; external, blob and already-based URLs stay unchanged',async()=>{
 const f=sandbox(),canonical='/assets/closit-profile-packs/assets/people/person_A_aligned.png';
 await f.context.fetch(canonical);assert.equal(f.fetched[0],'https://example.github.io/closit-plan-c'+canonical);assert.equal(canonical,'/assets/closit-profile-packs/assets/people/person_A_aligned.png');
 const image=new f.HTMLImageElement();image.src=canonical;assert.equal(image.src,f.fetched[0]);
 new f.Element().setAttribute('src',canonical);assert.equal(f.attributes[0].value,f.fetched[0]);
 new f.context.Worker('/foreground-worker.js');assert.equal(f.workers[0],'https://example.github.io/closit-plan-c/foreground-worker.js');
 for(const value of ['/closit-plan-c/assets/already.png','blob:https://example.github.io/local-photo','https://other.invalid/assets/photo.png','data:image/png;base64,AAAA']){
  image.src=value;assert.equal(image.src,value);
 }
});

test('static API attempts return explicit unavailable status without network or a mock success',async()=>{
 const f=sandbox();
 for(const method of ['GET','POST','PUT','DELETE']){
  const response=await f.context.fetch('/api/try-on',{method});assert.equal(response.status,503);
  const body=await response.json();assert.equal(body.error.code,'backend_unavailable');assert.match(body.error.message,/로컬 시연/);
 }
 assert.equal(f.fetched.length,0);
});
