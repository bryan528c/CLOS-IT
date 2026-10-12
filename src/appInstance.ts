import {createLocalLifeApp,browserLocalLifeStorage,LOCAL_LIFE_STORAGE_KEY} from './localLifeStorage';
import {installReviewedVisualBindings} from './lifeData/visualRepair';
import {installPlanCReferences} from './planc/data';
import {restoreLocalPhotos} from './localPhotoStorage';
import {checkpointBeforeProfilePack,installProfilePackV1} from './planc/profilePackV1Runtime';
/** User-approved local pack runtime. Remote adapters remain available, without auto-login. */
export const localLifeRuntime=true;
const storage=browserLocalLifeStorage();
export const profilePackV1Checkpoint=checkpointBeforeProfilePack(storage,LOCAL_LIFE_STORAGE_KEY);
const runtime=createLocalLifeApp(storage);
// A private backup precedes a single validated display-only migration, before UI subscribers mount.
export const localVisualRepair=installReviewedVisualBindings(runtime.app,storage,LOCAL_LIFE_STORAGE_KEY);
export const app=runtime.app;
export const planCInstallation=installPlanCReferences(app,storage,LOCAL_LIFE_STORAGE_KEY);
export const localPhotoRestoration=restoreLocalPhotos(app);
export const localLifeInstallation=runtime.installation;
export const profilePackV1Ready=installProfilePackV1(app,storage,LOCAL_LIFE_STORAGE_KEY);
