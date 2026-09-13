export const restaurantTables=Array.from({length:20},(_,i)=>'Table '+(i+1));
export function tableLabel(value?:string){if(!value?.trim())return 'Table not assigned';const text=value.trim();return /^table\s/i.test(text)?text:/^\d+$/.test(text)?'Table '+text:text;}
