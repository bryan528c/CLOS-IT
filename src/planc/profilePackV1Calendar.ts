import type {DemoEvent,DemoState} from '../core/types';
import {isProfilePackV1Installed,type ProfilePackV1Catalog} from './profilePackV1Adapter';

/** Read-only schedule projection. No synthetic outfit, mutable event or wear record is created.
 * Callers pass effective events so a cancelled/replaced plan cannot hide the unassigned fixture. */
export function profilePackV1UnassignedSchedules(catalog:ProfilePackV1Catalog,state:DemoState,owner:string,effectiveEvents:readonly DemoEvent[]){
 if(!isProfilePackV1Installed(catalog,state))return[];
 const bundle=catalog.bundles.find(b=>b.bundle.profile.id===owner);if(!bundle)return[];
 return bundle.calendarFixtures.filter(row=>row.ownerRef===bundle.profileRef&&row.kind==='plan'&&row.outfitRef===null&&row.details?.selectionStatus==='unassigned')
  .filter(row=>!effectiveEvents.some(event=>event.ownerId===owner&&event.kind==='plan'&&!event.voided&&event.date===row.date&&event.value===row.details.title&&!!event.outfitId))
  .map(row=>({id:row.ref,ownerId:owner,date:String(row.date),title:String(row.details.title),selectionStatus:'unassigned' as const,source:'approved-reference-fixture' as const,startsAt:null,place:null,travelMinutes:null}));
}
