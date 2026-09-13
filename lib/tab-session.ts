import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
export const validTab=(id:string)=>/^[a-f0-9]{32}$/.test(id);
export async function currentTab(){const id=(await headers()).get('x-nirili-tab')||'';return validTab(id)?id:'';}
export function withTab(path:string,id:string){if(!validTab(id)||!path.startsWith('/')||path.startsWith('//'))return path;const u=new URL(path,'https://local.invalid');u.searchParams.set('tab',id);return u.pathname+u.search+u.hash;}
export async function sessionCookieName(base='nirili_session'){const id=await currentTab();return id?base+'_'+id:base;}
export async function tabRedirect(path:string):Promise<never>{redirect(withTab(path,await currentTab()));}
