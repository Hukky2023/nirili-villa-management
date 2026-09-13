import {Actor,hasPermission} from './auth';
export const canPOS=(u:Actor|null)=>hasPermission(u,'waiter_pos')||hasPermission(u,'restaurant_pos')||hasPermission(u,'edit_bills');
export const restaurantOnly=(u:Actor|null)=>u?.role==='staff'&&u.permissions.some(p=>p==='restaurant_pos'||p==='waiter_pos')&&!u.permissions.some(p=>p!=='restaurant_pos'&&p!=='waiter_pos');

export const canTakePayment=(u:Actor|null)=>hasPermission(u,'restaurant_pos')||hasPermission(u,'edit_bills');
