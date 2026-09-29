export function GET(request:Request){
 const host=new URL(request.url).hostname;
 const hotel=['nirilihotels.com','www.nirilihotels.com'].includes(host);
 const publicBooking=['stay.nirilihotels.com','booking.nirilihotels.com'].includes(host);
 const lines=hotel
  ? ['User-agent: *','Allow: /','Disallow: /api/','Sitemap: https://nirilihotels.com/sitemap.xml']
  : publicBooking
   ? ['User-agent: *','Allow: /','Disallow: /api/','Disallow: /stay','Disallow: /book/manage','Disallow: /book/excursions/manage']
   : ['User-agent: *','Disallow: /'];
 return new Response(lines.join('\n')+'\n',{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=3600'}});
}
