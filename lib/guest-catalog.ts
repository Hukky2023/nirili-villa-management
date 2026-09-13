export const catalog=[
{id:'airport-arrival',kind:'transfer',name:'Airport → Dhiffushi',cents:3500,detail:'Shared speedboat arrival transfer, per person. Add your flight details and preferred time. Reception confirms the available departure.'},
{id:'airport-departure',kind:'transfer',name:'Dhiffushi → Airport',cents:3500,detail:'Shared speedboat departure transfer, per person. Include your flight time so reception can help arrange a suitable boat.'},
{id:'breakfast',kind:'food',name:'Breakfast',cents:1200,detail:'Breakfast meal. Ask the team about today’s selection and dietary requirements.'},
{id:'lunch',kind:'food',name:'Lunch',cents:1800,detail:'Lunch meal prepared by the restaurant. Please include dietary requirements in your order.'},
{id:'dinner',kind:'food',name:'Dinner',cents:2200,detail:'Evening meal. Confirm today’s dishes with our restaurant team.'},
{id:'water',kind:'food',name:'Water',cents:200,detail:'Drinking water from the restaurant.'},
{id:'coffee',kind:'food',name:'Coffee',cents:400,detail:'Freshly prepared coffee. Add your milk or sugar preference in the notes.'},
{id:'juice',kind:'food',name:'Fresh juice',cents:600,detail:'Fresh juice. Fruit selection depends on availability.'},
{id:'seafood',kind:'food',name:'Seafood dinner',cents:5000,detail:'Seafood dinner, subject to the day’s availability. Tell us about any allergies.'},
{id:'turtle',kind:'excursion',name:'Turtle Snorkeling',cents:2500,detail:'Guided snorkeling to look for turtles. Equipment and underwater videos included. Wildlife sightings depend on conditions.'},
{id:'shark',kind:'excursion',name:'Shark Snorkeling',cents:10000,detail:'Guided shark snorkeling experience. Equipment and underwater videos included. Timing depends on sea conditions.'},
{id:'sandbank',kind:'excursion',name:'Sandbank Trip',cents:2500,detail:'Visit a sandbank for swimming and photos. Departure depends on tides and weather.'},
{id:'dolphin',kind:'excursion',name:'Dolphin Cruise',cents:2500,detail:'Boat trip to look for dolphins. Sightings cannot be guaranteed. The team confirms departure time.'},
{id:'fishing',kind:'excursion',name:'Night Fishing',cents:4000,detail:'Evening fishing trip with local guidance. The team confirms the meeting point and departure time.'},
{id:'coral',kind:'excursion',name:'Coral Garden',cents:4500,detail:'Guided reef snorkeling with equipment and underwater videos included.'},
{id:'fishtank',kind:'excursion',name:'Fish Tank',cents:6500,detail:'Guided snorkeling at Fish Tank with equipment and underwater videos included.'}
];
export const plans=['Bed & Breakfast','Half Board','Full Board'];
export function nightly(plan:string,pax:number){return ({'Bed & Breakfast':[5000,6000,7000],'Half Board':[7000,8000,9000],'Full Board':[8000,10000,12000]} as any)[plan]?.[pax-1]||0;}
export const islandToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const validDate=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
