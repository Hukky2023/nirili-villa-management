import {Actor,hasPermission} from './auth';
export const isTransportAgent=(u:Actor|null)=>!!u&&u.role==='guest'&&(u.permissions as string[]).includes('transport_agent');
export const canTransport=(u:Actor|null)=>!!u&&(u.role==='guest'||hasPermission(u,'edit_transfers'));
export const transportRole=(u:Actor)=>u.role==='admin'?'Admin':isTransportAgent(u)?'Agent':u.role==='staff'?'Reception':'Guest';
export const transportPortalAllowed=(u:Actor,portal:string)=>portal==='transport_admin'?u.role==='admin':portal==='transport_reception'?hasPermission(u,'edit_transfers'):portal==='transport_agent'?isTransportAgent(u):portal==='transport_guest'?u.role==='guest'&&!isTransportAgent(u):false;
