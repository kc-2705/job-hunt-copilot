import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Badge, Button, Empty, Select, Skeleton, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useJobs, useJobStats, useResume, useUpdateJob } from '../api/hooks';
import { errorMessage } from '../api/client';
import { ScorePill, SponsorshipTag, STATUSES, workLabel } from '../components/common';
import AddJobModal from '../components/AddJobModal';

dayjs.extend(relativeTime);

function JobCard({ job, onMove }) {
  return (
    <Link
      to={`/jobs/${job._id}`}
      className="job-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', job._id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
        <div className="title">{job.title}</div>
        <ScorePill score={job.match?.score} />
      </Space>
      <div className="company">
        {[job.company, workLabel(job.details?.workType)].filter(Boolean).join(' · ')}
      </div>
      <Space size={4} wrap>
        <SponsorshipTag value={job.details?.sponsorship} short />
        <span className="muted" style={{ fontSize: 12 }}>
          {job.appliedAt ? `Applied ${dayjs(job.appliedAt).fromNow()}` : `Added ${dayjs(job.createdAt).fromNow()}`}
        </span>
      </Space>
      {/* Drag and drop needs a mouse; this keeps the board usable on phones and by keyboard. */}
      <Select
        size="small"
        value={job.status}
        options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        onClick={(e) => e.preventDefault()}
        onChange={(status) => onMove(job, status)}
        style={{ width: '100%', marginTop: 8 }}
        aria-label="Move to"
      />
    </Link>
  );
}

export default function Board() {
  const { message } = App.useApp();
  const { data: jobs, isLoading, error } = useJobs();
  const { data: stats } = useJobStats();
  const { data: resume, isLoading: resumeLoading } = useResume();
  const update = useUpdateJob();
  const [adding, setAdding] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);

  async function move(job, status) {
    if (job.status === status) return;
    try {
      await update.mutateAsync({ id: job._id, status });
      message.success(`Moved to ${STATUSES.find((s) => s.key === status).label}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  }

  const responded = stats ? stats.byStatus.interview + stats.byStatus.offer : 0;
  const sent = stats ? stats.byStatus.applied + responded + stats.byStatus.rejected : 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Your job board</h1>
          <p className="muted">Add a job post, check your fit, then drag it along as you apply.</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => setAdding(true)}>Add job</Button>
      </div>

      {!resumeLoading && !resume && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="Add your resume first so the AI can compare it with each job."
          action={<Link to="/resume"><Button size="small" type="primary">Add resume</Button></Link>}
        />
      )}

      <div className="stat-row">
        <div className="stat"><div className="label">Jobs tracked</div><div className="value">{stats?.total ?? '–'}</div></div>
        <div className="stat"><div className="label">Applications sent</div><div className="value">{stats ? sent : '–'}</div></div>
        <div className="stat"><div className="label">Response rate</div><div className="value">{sent ? `${Math.round((responded / sent) * 100)}%` : '–'}</div></div>
        <div className="stat"><div className="label">Average match</div><div className="value">{stats?.avgScore != null ? `${stats.avgScore}%` : '–'}</div></div>
      </div>

      {error && <Alert type="error" showIcon title={errorMessage(error)} />}
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : jobs?.length === 0 ? (
        <Empty description="No jobs yet. Paste a job post to get started." style={{ padding: 48 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAdding(true)}>Add your first job</Button>
        </Empty>
      ) : (
        <div className="board">
          {STATUSES.map((s) => {
            const items = (jobs ?? []).filter((j) => j.status === s.key);
            return (
              <section
                key={s.key}
                className={`column ${dropTarget === s.key ? 'drop' : ''}`}
                aria-label={s.label}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTarget(s.key);
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropTarget(null);
                  const job = jobs.find((j) => j._id === e.dataTransfer.getData('text/plain'));
                  if (job) move(job, s.key);
                }}
              >
                <div className="column-title">
                  <span><Badge color={s.color} /> {s.label}</span>
                  <span className="muted">{items.length}</span>
                </div>
                {items.map((job) => <JobCard key={job._id} job={job} onMove={move} />)}
              </section>
            );
          })}
        </div>
      )}

      <AddJobModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}
