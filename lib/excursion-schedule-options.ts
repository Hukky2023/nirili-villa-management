export const standardScheduleSuggestions=[
 'Fish Tank Snorkeling + Sandbank Trip',
 'Turtle Snorkeling + Coral Garden Snorkeling',
 'Sandbank Trip + Turtle Snorkeling',
 'Shark Snorkeling (Nurse Shark) + Turtle Snorkeling',
 'Clown Fish Snorkeling + Manta Snorkeling',
 'Dolphin Watching + Fishing with Dinner',
 'Dolphin Watching only'
];

export function excursionScheduleNameOptions(menu:any[]){
 const activeNames=(Array.isArray(menu)?menu:[])
  .filter((item:any)=>item?.kind==='excursion'&&item?.active!==false&&item?.id!=='special-package')
  .map((item:any)=>String(item?.name||'').trim())
  .filter(Boolean);
 return Array.from(new Set([...standardScheduleSuggestions,...activeNames]));
}
