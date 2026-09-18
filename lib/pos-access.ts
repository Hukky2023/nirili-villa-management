import {Actor,hasPermission} from './auth';
export const canPOS=(u:Actor|null)=>hasPermission(u,'waiter_pos')||hasPermission(u,'restaurant_pos')||hasPermission(u,'edit_bills');
export const canKitchen=(u:Actor|null)=>hasPermission(u,'kitchen_pos')||canPOS(u);
export const restaurantOnly=(u:Actor|null)=>u?.role==='staff'&&u.permissions.some(p=>p==='restaurant_pos'||p==='waiter_pos'||p==='kitchen_pos')&&!u.permissions.some(p=>!['restaurant_pos','waiter_pos','kitchen_pos'].includes(p));

export const canTakePayment=(u:Actor|null)=>hasPermission(u,'restaurant_pos')||hasPermission(u,'edit_bills');
