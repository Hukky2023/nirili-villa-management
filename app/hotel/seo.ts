import type {Metadata} from 'next';

export const HOTEL_ORIGIN='https://nirilihotels.com';

export function hotelMetadata(title:string,description:string,path:string):Metadata{
 const url=HOTEL_ORIGIN+path;
 return {
  title,description,
  alternates:{canonical:url},
  openGraph:{type:'website',locale:'en_GB',siteName:'Nirili Hotel · Dhiffushi',title,description,url},
  twitter:{card:'summary',title,description},
 };
}
export const hotelIdentity={
 '@context':'https://schema.org','@graph':[
  {'@type':'Hotel','@id':HOTEL_ORIGIN+'/#hotel',name:'Nirili Villa',alternateName:'Nirili Hotel',
   url:HOTEL_ORIGIN+'/',telephone:'+9609413977',
   address:{'@type':'PostalAddress',addressLocality:'Dhiffushi',addressRegion:'Kaafu Atoll',addressCountry:'MV'}},
  {'@type':'Organization','@id':HOTEL_ORIGIN+'/#tours',name:'Nirili Tours',
   url:HOTEL_ORIGIN+'/hotel/excursions',telephone:'+9609413977'},
  {'@type':'WebSite','@id':HOTEL_ORIGIN+'/#website',url:HOTEL_ORIGIN+'/',name:'Nirili Hotel',
   publisher:{'@id':HOTEL_ORIGIN+'/#hotel'}}
 ]
};
