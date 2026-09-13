import type {Actor} from "./auth";
export async function roleFor(user:Actor){return user.role;}
