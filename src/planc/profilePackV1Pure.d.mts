/** Types for the byte-preserved pure projection module from the locked v1 release.
 * Raw JSON remains at this boundary; ProfilePackV1Adapter validates before persistence. */
export function canonical(value:unknown):string;
export function sha256(value:string|Uint8Array):string;
export function hashRow(value:unknown):string;
export function safeRelativePath(path:string):string;
export function resolveAsset(path:string,baseUrl?:string):string;
export function assemblePack(files:Map<string,Uint8Array>|Record<string,Uint8Array>):any;
export function toExistingProfileBundle(pack:any,profileRef:string,bindings?:any,baseUrl?:string):any;
export function matchExistingPreparedSnapshot(pack:any,snapshot:any,currentSnapshot?:any,bindings?:any,baseUrl?:string):any;
export function findPreparedFitting(pack:any,request:any,currentRequest?:any,baseUrl?:string):any;
export function resolvePackLocation(pack:any,profileRef:string,garmentRef:string,sceneHash:string,sceneVariant?:string):any;
export function careGuideFor(pack:any,profileRef:string,garmentRef:string):any;
export function fittingSignature(value:any):string;
export function createFlatlayLayout(pack:any,profileRef:string,garmentRefs:string[]):any;
export function deriveGarmentSummary(pack:any,profileRef:string,garmentRef:string):any;
