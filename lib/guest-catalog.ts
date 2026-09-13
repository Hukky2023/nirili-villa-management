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
{"id": "snorkeling", "kind": "excursion", "name": "Snorkeling", "cents": 2000, "group": "Excursions", "minGuests": 2, "detail": "Explore the underwater world around Dhiffushi."},
{"id": "turtle", "kind": "excursion", "name": "Turtle Snorkeling", "cents": 2500, "group": "Excursions", "minGuests": 2, "detail": "Snorkel and look for turtles."},
{"id": "shark", "kind": "excursion", "name": "Shark Snorkeling (Nurse Shark)", "cents": 10000, "group": "Excursions", "minGuests": 2, "detail": "Discover nurse sharks on a snorkeling excursion."},
{"id": "coral", "kind": "excursion", "name": "Coral Garden Snorkeling", "cents": 4500, "group": "Excursions", "minGuests": 2, "detail": "Explore the coral garden."},
{"id": "fishtank", "kind": "excursion", "name": "Fish Tank Snorkeling", "cents": 6500, "group": "Excursions", "minGuests": 2, "detail": "Discover the marine life at Fish Tank."},
{"id": "dolphin", "kind": "excursion", "name": "Dolphin Watching", "cents": 2500, "group": "Excursions", "minGuests": 2, "detail": "Head out on the water to look for dolphins."},
{"id": "fishing", "kind": "excursion", "name": "Fishing", "cents": 4000, "group": "Excursions", "minGuests": 2, "detail": "Enjoy a fishing trip with Nirili Tours."},
{"id": "sandbank", "kind": "excursion", "name": "Sandbank Trip", "cents": 2500, "group": "Excursions", "minGuests": 2, "detail": "Visit a sandbank for swimming and island views."},
{"id": "sandbank-dinner", "kind": "excursion", "name": "Sandbank Dinner", "cents": 15000, "group": "Excursions", "minGuests": 2, "detail": "Enjoy dinner on a sandbank."},
{"id": "beach-seafood-dinner", "kind": "excursion", "name": "Beach Dinner with Seafood", "cents": 10000, "group": "Excursions", "minGuests": 2, "detail": "A seafood dinner by the beach."},
{"id": "shark-turtle", "kind": "excursion", "name": "Shark + Turtle Snorkeling", "cents": 11000, "group": "Combined packages", "minGuests": 2, "detail": "Shark snorkeling and turtle snorkeling in one package."},
{"id": "coral-sandbank", "kind": "excursion", "name": "Coral Garden + Sandbank", "cents": 6000, "group": "Combined packages", "minGuests": 2, "detail": "Coral Garden snorkeling and a sandbank visit."},
{"id": "dolphin-fishing-dinner", "kind": "excursion", "name": "Dolphin Watching + Fishing + Dinner", "cents": 5000, "group": "Combined packages", "minGuests": 2, "detail": "Dolphin watching, fishing and dinner."},
{"id": "fishtank-turtle", "kind": "excursion", "name": "Fish Tank + Turtle Snorkeling", "cents": 8000, "group": "Combined packages", "minGuests": 2, "detail": "Fish Tank snorkeling and turtle snorkeling."},
{"id": "special-package", "kind": "excursion", "name": "Special Package", "cents": 22000, "group": "Special package", "minGuests": 2, "detail": "Turtle Snorkeling + Shark Snorkeling + Sandbank + Coral Garden + Dolphin Watching + Fishing with Dinner."}
];
export const plans=['Bed & Breakfast','Half Board','Full Board'];
export function nightly(plan:string,pax:number){return ({'Bed & Breakfast':[5000,6000,7000],'Half Board':[7000,8000,9000],'Full Board':[8000,10000,12000]} as any)[plan]?.[pax-1]||0;}
export const islandToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Indian/Maldives',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const validDate=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
