/// <reference types="vite/client" />
/** Public URL only. Persistent asset IDs and canonical /assets paths remain unchanged. */
export function deploymentAssetHref(path:string,origin=location.href){
 const base=import.meta.env?.BASE_URL??'/';
 return new URL(path.startsWith('/assets/')?base+path.slice(1):path,origin).href;
}
