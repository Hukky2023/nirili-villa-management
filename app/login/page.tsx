import LoginForm from "./form";

const allowed=new Set(["direct","admin","staff","guest","crew_member","buggy_driver","restaurant_cashier","restaurant_waiter","restaurant_kitchen","restaurant_guest"]);
export default async function Login({searchParams}:{searchParams:Promise<{portal?:string;returnTo?:string;username?:string}>}){
 const p=await searchParams;
 const portal=allowed.has(p.portal||"")?p.portal!:"direct";
 return <LoginForm portal={portal} returnTo={p.returnTo||""} initialUsername={(p.username||"").slice(0,254)}/>;
}
