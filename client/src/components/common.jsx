import { Tag, Tooltip } from 'antd';

export const STATUSES = [
  { key: 'saved', label: 'Saved', color: '#64748b' },
  { key: 'applied', label: 'Applied', color: '#4f46e5' },
  { key: 'interview', label: 'Interview', color: '#0891b2' },
  { key: 'offer', label: 'Offer', color: '#16a34a' },
  { key: 'rejected', label: 'Rejected', color: '#dc2626' },
];

export function scoreColor(score) {
  if (score == null) return '#94a3b8';
  if (score >= 75) return '#16a34a';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

export function ScorePill({ score }) {
  return (
    <Tooltip title={score == null ? 'Not analyzed yet' : 'How well your resume matches this job'}>
      <span className="score-pill" style={{ background: scoreColor(score) }}>
        {score == null ? '—' : `${score}%`}
      </span>
    </Tooltip>
  );
}

/** Visa sponsorship is the first thing many job seekers need to know. */
export function SponsorshipTag({ value, short = false }) {
  if (value === 'no') return <Tag color="red" variant="filled">{short ? 'No sponsor' : 'No visa sponsorship'}</Tag>;
  if (value === 'yes') return <Tag color="green" variant="filled">{short ? 'Sponsors' : 'Sponsors visas'}</Tag>;
  return short ? null : <Tag variant="filled">Sponsorship not stated</Tag>;
}

const WORK = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
export const workLabel = (w) => WORK[w];

/** "Austin, TX · Hybrid", skipping the work type when the location already says it. */
export function placeLabel(details = {}) {
  const work = workLabel(details.workType);
  const loc = details.location || '';
  return [loc, work && !loc.toLowerCase().includes(work.toLowerCase()) ? work : null].filter(Boolean).join(' · ');
}
