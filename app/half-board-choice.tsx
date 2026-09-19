'use client';
import {useState} from 'react';
import type {MainMeal, MealContext} from '../lib/meal-access';
import {UiText} from './ui-language';
import './half-board-choice.css';

type Props = {stayId: string; access?: MealContext; disabled?: boolean; onChanged: () => Promise<unknown>; onBusy: (busy: boolean) => void};
export default function HalfBoardChoice({stayId, access, disabled, onChanged, onBusy}: Props) {
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  if (!access?.active || access.meal !== 'Half Board') return null;
  async function choose(meal: MainMeal) {
    if (!access || saving || disabled || access.locked || access.choice === meal) return;
    setSaving(true); onBusy(true); setError('');
    try {
      const response = await fetch('/api/meal-selection', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({stayId, meal, date: access.date, version: access.version})});
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Could not save the meal selection.');
      await onChanged();
      window.dispatchEvent(new Event('services-updated'));
      window.dispatchEvent(new Event('pos-updated'));
    } catch (cause) {
      setError((cause as Error).message); await onChanged();
    } finally {setSaving(false); onBusy(false);}
  }
  return <section className="half-board-choice" aria-label="Daily Half Board meal selection">
    <div className="half-board-choice-heading"><div><strong><UiText>Half Board · Choose your free meal</UiText></strong>
      <p><UiText>Breakfast is included, 7:00–9:00 a.m. Choose one included lunch or dinner for today.</UiText></p></div>
      <small>{access.date}<br/><UiText>Maldives time</UiText></small></div>
    <div className="half-board-choice-options">
      {(['lunch', 'dinner'] as const).map(meal => <button type="button" key={meal} aria-pressed={access.choice === meal}
        disabled={!!disabled || saving || access.locked} onClick={() => choose(meal)}>
        <b><UiText>{meal === 'lunch' ? 'Free Lunch' : 'Free Dinner'}</UiText></b>
        <span>{meal === 'lunch' ? (access.friday ? '1:30–3:00 p.m.' : '12:00–3:00 p.m.') : '6:00–9:00 p.m.'}</span>
        <span><UiText>{meal === 'lunch' ? 'Dinner charged at menu prices' : 'Lunch charged at menu prices'}</UiText></span>
        <strong><UiText>{access.choice === meal ? (access.locked ? 'Used · Locked for today' : 'Selected') : 'Not selected'}</UiText></strong>
      </button>)}
    </div>
    <p className="half-board-choice-status" role="status"><UiText>{saving ? 'Saving your daily selection…' : access.locked
      ? 'Your included ' + access.choice + ' has been ordered. The other main meal is charged today.'
      : 'The choice locks when an included lunch or dinner order is sent. Paid extras are always charged.'}</UiText></p>
    <p className="half-board-choice-hours"><UiText>{access.period ? 'Current meal service: ' + access.period + '.' : 'Outside included meal hours. Orders placed now are charged at menu prices.'}</UiText></p>
    {error && <p role="alert" className="half-board-choice-error"><UiText>{error}</UiText></p>}
  </section>;
}
