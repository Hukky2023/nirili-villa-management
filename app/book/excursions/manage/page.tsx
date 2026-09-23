import type {Metadata} from 'next';
import ManageExcursionSite from './site';
import './style.css';

export const metadata:Metadata={title:'Manage Excursion | Nirili Tours · Dhiffushi',description:'View, change or cancel your Nirili Tours excursion booking.',referrer:'no-referrer'};
export default function ManageExcursionPage(){return <ManageExcursionSite/>}
