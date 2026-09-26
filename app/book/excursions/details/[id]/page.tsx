import type {Metadata} from 'next';
import ExcursionDetailsSite from './site';
import '../../../style.css';
import '../../style.css';
import './style.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
 title:'Excursion Details | Nirili Tours · Dhiffushi',
 description:'View Nirili Tours excursion details, video, pricing and booking information.',
 robots:{index:true,follow:true}
};

export default async function ExcursionDetailsPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 return <ExcursionDetailsSite excursionId={decodeURIComponent(id)}/>;
}
