import WebsiteChat from '../website-chat';
import type {Metadata} from 'next';

export const metadata:Metadata={
 title:'Nirili Stay | Book Nirili Villa, Dhiffushi',
 description:'Nirili Stay is the dedicated room-booking website for Nirili Villa in Dhiffushi. Check room availability, packages and meal plans.',
 alternates:{canonical:'https://booking.nirilihotels.com/'},
 robots:{index:true,follow:true},
 openGraph:{
  title:'Nirili Stay · Nirili Villa · Dhiffushi, Maldives',
  description:'Book your island stay directly with Nirili Villa.',
  type:'website'
 }
};

export default function BookLayout({children}:{children:React.ReactNode}){
 return <>{children}<WebsiteChat/></>;
}
