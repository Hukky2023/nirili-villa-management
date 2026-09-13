import LoginForm from "./form";
export default async function Login({searchParams}:{searchParams:Promise<{portal?:string;returnTo?:string}>}){const p=await searchParams;return <LoginForm portal={["admin","staff","guest"].includes(p.portal||"")?p.portal!:"guest"} returnTo={p.returnTo||""}/>;}
