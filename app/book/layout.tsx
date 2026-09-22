import type {Metadata} from 'next';

export const metadata:Metadata={
 title:'Book Nirili Villa | Dhiffushi, Maldives',
 description:'Check room availability and request your stay at Nirili Villa, Dhiffushi. Bed & Breakfast, Half Board and Full Board options available.',
 robots:{index:true,follow:true},
 openGraph:{
  title:'Nirili Villa · Dhiffushi, Maldives',
  description:'Book your island stay directly with Nirili Villa.',
  type:'website'
 }
};

export default function BookLayout({children}:{children:React.ReactNode}){
 return children;
}
