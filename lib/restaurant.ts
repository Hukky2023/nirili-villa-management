export type Bill={id:string;room:string;guest:string;date:string;status:string;items:[string,number,number,number][];revision:number};
export const total=(b:Bill)=>Math.round(b.items.reduce((s,x)=>s+Math.round(x[2]*100)*(1-x[3]/100),0))/100;
export function initialBill(room:string,id:string):Bill|null{
 const guests:Record<string,string>={"101":"Qiao Mingzhi","102":"Liu Yutong","103":"Marco Rossi","104":"Victoria Chen"};
 if(!guests[room]||!["RES-1048","RES-1061"].includes(id))return null;
 return {id,room,guest:guests[room],date:id==="RES-1048"?"12 Sep · 08:15":"12 Sep · 19:42",status:"Posted",revision:0,items:id==="RES-1048"?[["Breakfast set",2,24,0],["Coffee",2,8,0]]:[["Fresh juice",1,6,0],["Fried rice",1,8,0]]};
}
