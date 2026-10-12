import raw from './profilePackV1Data.json';
import {buildProfilePackV1,type RawProfilePackV1} from './profilePackV1Adapter';
export const profilePackV1Catalog=buildProfilePackV1(raw as unknown as RawProfilePackV1);
