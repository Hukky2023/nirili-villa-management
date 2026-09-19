import {MEAL_RULE_VERSION, MEAL_TIME_ZONE, mealService} from '../../../lib/meal-access';

// Public service hours only. No accounts, bookings, or operational data are read.
export async function GET() {
  return Response.json({version: MEAL_RULE_VERSION, timeZone: MEAL_TIME_ZONE,
    regularDays: 'Saturday–Thursday',
    regular: {breakfast: ['07:00','09:00'], lunch: ['12:00','15:00'], dinner: ['18:00','21:00']},
    friday: {breakfast: ['07:00','09:00'], lunch: ['13:30','15:00'], dinner: ['18:00','21:00']},
    halfBoard: 'Breakfast plus one included lunch OR dinner per Maldives day; paid extras are charged.',
    today: mealService()
  }, {headers: {'Cache-Control': 'no-store'}});
}
