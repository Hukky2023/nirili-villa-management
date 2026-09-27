import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function ExcursionDetailsPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 redirect('https://www.nirilihotels.com/hotel/excursions/'+encodeURIComponent(id));
}
