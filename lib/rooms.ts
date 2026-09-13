export const roomNumbers=['101','102','103','104','105','106','201','202','203','204','301','302','303','304'];
export const roomDetails={type:'Double Room',bed:'King bed',extraBed:'Optional extra single bed',capacity:3,occupancy:'3 adults or 2 adults and 1 child'};
const renamed:Record<string,string>={'107':'301','205':'302','206':'303','207':'304'};
export function updateRoomInventory(state:any){
 if(state.roomInventoryVersion!==2){
  for(const r of state.rooms||[])r.number=renamed[r.number]||r.number;
  for(const list of [state.stays,state.requests,state.orders,state.posOrders])for(const record of list||[])if(record.room)record.room=renamed[record.room]||record.room;
  state.roomInventoryVersion=2;
 }
 state.rooms=roomNumbers.map(number=>({...((state.rooms||[]).find((r:any)=>r.number===number)||{status:'Available',note:''}),number,...roomDetails}));
 return state;
}
