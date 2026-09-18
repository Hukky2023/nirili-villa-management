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

export default function ExcursionGuidePicker({crew, crewIds, guideIds, confirmedPax, onChange}: Props) {
  const required = requiredExcursionGuides(confirmedPax);
  const count = assignedGuideCount(guideIds, crewIds, crew);
  const missing = Math.max(0, required - count);
  function toggleCrew(id: string) {
    const assigned = crewIds.includes(id);
    onChange(assigned ? crewIds.filter(value => value !== id) : [...crewIds, id], assigned ? guideIds.filter(value => value !== id) : guideIds);
  }
  function toggleGuide(id: string) {
    onChange(crewIds, guideIds.includes(id) ? guideIds.filter(value => value !== id) : [...guideIds, id]);
  }
  return <fieldset className="excursion-guide-picker">
    <legend>Crew and guides</legend>
    <p>Select the crew, then tick <strong>Guide</strong> for each person working as a guide. Other crew do not count toward the guide minimum.</p>
    <p className={'excursion-guide-notice ' + (missing ? 'needs-guides' : '')} role="status">
      {confirmedPax} confirmed passengers · {required ? `${count} / ${required} guides assigned` : `${count} guides assigned`}
      {missing > 0 && <><strong>Assign {missing} more {missing === 1 ? 'guide' : 'guides'}.</strong><small>Select the crew member first, then tick the Guide box on the right. Save assignment will explain anything still missing.</small></>}
      {required === 0 && <small>At 5 or more confirmed passengers, at least 3 guides are required.</small>}
    </p>
    {crew.length ? <div className="excursion-guide-options">{crew.map(member => {
      const unavailable = member.active === false || member.active === 0;
      return <div key={member.id} className="excursion-guide-option">
        <label><input type="checkbox" checked={crewIds.includes(member.id)} disabled={unavailable&&!crewIds.includes(member.id)} onChange={() => toggleCrew(member.id)}/><span>{member.name}{unavailable ? ' (inactive)' : ''}</span></label>
        <label><input type="checkbox" checked={guideIds.includes(member.id)} disabled={unavailable&&!guideIds.includes(member.id) || !crewIds.includes(member.id)} onChange={() => toggleGuide(member.id)}/>Guide</label>
      </div>;
    })}</div> : <p>No crew members are available. Add crew members before assigning guides.</p>}
  </fieldset>;
}
