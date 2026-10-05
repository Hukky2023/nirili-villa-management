'use client';
import {assignedGuideCount, requiredExcursionGuides} from '../lib/excursion-guides';
import './excursion-guides.css';

type Props = {
  crew: any[];
  crewIds: string[];
  guideIds: string[];
  confirmedPax: number;
  onChange: (crewIds: string[], guideIds: string[]) => void;
};

export default function ExcursionGuidePicker({crew, crewIds, confirmedPax, onChange}: Props) {
  const required = requiredExcursionGuides(confirmedPax);
  const count = assignedGuideCount([], crewIds, crew);
  const missing = Math.max(0, required - count);

  function toggleCrew(id: string) {
    const assigned = crewIds.includes(id);
    const nextCrew = assigned ? crewIds.filter(value => value !== id) : [...crewIds, id];
    // In Nirili operations, assigned excursion crew are the trip guides.
    onChange(nextCrew, nextCrew);
  }

  return <fieldset className="excursion-guide-picker">
    <legend>Crew / guides</legend>
    <p>Select the crew working on this trip. Every assigned crew member counts as a guide.</p>
    <p className={'excursion-guide-notice ' + (missing ? 'needs-guides' : '')} role="status">
      {confirmedPax} confirmed passengers · {required ? `${count} / ${required} guides assigned` : `${count} crew assigned`}
      {missing > 0 && <><strong>Assign {missing} more {missing === 1 ? 'guide' : 'guides'}.</strong><small>For 5 or more confirmed passengers, assign at least 3 crew members to this trip.</small></>}
      {required === 0 && <small>At 5 or more confirmed passengers, at least 3 assigned crew members are required.</small>}
    </p>
    {crew.length ? <div className="excursion-guide-options">{crew.map(member => {
      const assigned = crewIds.includes(member.id);
      const inactive = member.active === false || member.active === 0;
      const busyUntil = String(member.busyUntil || '');
      const unavailable = inactive || (!!busyUntil && !assigned);
      return <div key={member.id} className="excursion-guide-option">
        <label><input type="checkbox" checked={assigned} disabled={unavailable&&!assigned} onChange={() => toggleCrew(member.id)}/><span>{member.name}{inactive ? ' (inactive)' : busyUntil && !assigned ? ' — Busy until '+busyUntil : ''}</span></label>
        <label title="Assigned crew automatically count as guides"><input type="checkbox" checked={assigned} disabled readOnly/>Guide</label>
      </div>;
    })}</div> : <p>No crew members are available. Add crew members before assigning this trip.</p>}
  </fieldset>;
}
