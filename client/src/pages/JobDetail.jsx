import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Alert, App, Button, Card, Col, Descriptions, Empty, Input, Popconfirm, Progress, Result, Row, Select, Skeleton, Space, Tabs, Tag, Tooltip, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleFilled, CloseCircleFilled, CopyOutlined, DeleteOutlined, ExclamationCircleFilled, LinkOutlined, ReloadOutlined, RobotOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAnalyzeJob, useCoverLetter, useDeleteJob, useJob, useResume, useTailorJob, useUpdateJob } from '../api/hooks';
import { errorMessage } from '../api/client';
import { placeLabel, scoreColor, SponsorshipTag, STATUSES } from '../components/common';

const VERDICT = {
  met: { icon: <CheckCircleFilled style={{ color: 'var(--met)' }} />, label: 'Met' },
  partial: { icon: <ExclamationCircleFilled style={{ color: 'var(--partial)' }} />, label: 'Partly met' },
  missing: { icon: <CloseCircleFilled style={{ color: 'var(--missing)' }} />, label: 'Missing' },
};

function useCopy() {
  const { message } = App.useApp();
  return async (text, what = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(what);
    } catch {
      message.error('Could not copy. Select the text and copy it instead.');
    }
  };
}

/** Runs an AI action and shows any error as a message. */
function useAiAction(mutation, done) {
  const { message } = App.useApp();
  return async (id) => {
    try {
      await mutation.mutateAsync(id);
      if (done) message.success(done);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
}

function MatchTab({ job, chunks, hasResume }) {
  const analyze = useAnalyzeJob();
  const run = useAiAction(analyze, 'Match report ready');
  const match = job.match;

  if (!hasResume) {
    return <Empty description="Add your resume to see how well you match.">{<Link to="/resume"><Button type="primary">Add resume</Button></Link>}</Empty>;
  }
  if (!match?.analyzedAt) {
    return (
      <Empty image={<RobotOutlined style={{ fontSize: 48, color: 'var(--brand)' }} />} description="Check every requirement against your resume, with proof for each.">
        <Button type="primary" size="large" icon={<RobotOutlined />} loading={analyze.isPending} onClick={() => run(job._id)}>
          {analyze.isPending ? 'Checking your resume…' : 'Analyze my match'}
        </Button>
      </Empty>
    );
  }

  const groups = ['required', 'nice'].map((imp) => ({ imp, items: match.items.filter((i) => i.importance === imp) }));
  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} md={8}>
        <Card>
          <div style={{ textAlign: 'center' }}>
            <Progress type="dashboard" percent={match.score} strokeColor={scoreColor(match.score)} size={160} />
            <p className="muted" style={{ marginTop: 0 }}>Must-haves count twice as much as nice-to-haves.</p>
          </div>
          {match.gaps.length > 0 && (
            <Alert type="warning" showIcon style={{ marginBottom: 12 }} title="Missing must-haves" description={match.gaps.join(', ')} />
          )}
          <Button block icon={<ReloadOutlined />} loading={analyze.isPending} onClick={() => run(job._id)}>Analyze again</Button>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 8 }}>Checked {dayjs(match.analyzedAt).format('MMM D, h:mm A')}</p>
        </Card>
      </Col>
      <Col xs={24} md={16}>
        {groups.map(({ imp, items }) =>
          items.length ? (
            <Card key={imp} title={imp === 'required' ? 'Must-haves' : 'Nice to have'} style={{ marginBottom: 16 }}>
              {items.map((i) => (
                <div key={i.skill} className="req">
                  <Tooltip title={VERDICT[i.verdict].label}><span className="icon">{VERDICT[i.verdict].icon}</span></Tooltip>
                  <div>
                    <strong>{i.skill}</strong>
                    <div className="muted" style={{ fontSize: 13 }}>{i.explanation}</div>
                  </div>
                  {i.evidence.map((e) => chunks[e] && (
                    <div key={e} className="evidence" title={chunks[e].section}>“{chunks[e].text}”</div>
                  ))}
                </div>
              ))}
            </Card>
          ) : null,
        )}
      </Col>
    </Row>
  );
}

function TailorTab({ job, hasResume }) {
  const tailor = useTailorJob();
  const run = useAiAction(tailor, 'Bullets tailored');
  const copy = useCopy();

  if (!hasResume) return <Empty description="Add your resume first." />;
  const action = (
    <Button type={job.tailored?.length ? 'default' : 'primary'} icon={<RobotOutlined />} loading={tailor.isPending} onClick={() => run(job._id)}>
      {tailor.isPending ? 'Rewriting…' : job.tailored?.length ? 'Rewrite again' : 'Tailor my bullets'}
    </Button>
  );
  if (!job.tailored?.length) {
    return <Empty description="Reword your most relevant bullets for this job, without adding anything that isn’t true.">{action}</Empty>;
  }
  return (
    <Card
      title="Your bullets, tailored for this job"
      extra={<Space><Button icon={<CopyOutlined />} onClick={() => copy(job.tailored.map((b) => `• ${b.rewritten}`).join('\n'), 'All bullets copied')}>Copy all</Button>{action}</Space>}
    >
      <Alert type="info" showIcon style={{ marginBottom: 8 }} title="The AI only rewords your own bullets. Anything it added that wasn’t in the original is flagged in orange so you can check it." />
      {job.tailored.map((b) => (
        <div key={b.chunk} className="compare">
          <div>
            <div className="tag-line">Original</div>
            <div className="before">{b.original}</div>
          </div>
          <div>
            <div className="tag-line">Tailored</div>
            <div>{b.rewritten}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{b.reason}</div>
            <Space size={4} wrap style={{ marginTop: 6 }}>
              {b.newTerms.length > 0 && (
                <Tooltip title="Not in your original bullet. Only keep it if it’s true.">
                  <Tag color="orange" icon={<WarningOutlined />}>Check: {b.newTerms.join(', ')}</Tag>
                </Tooltip>
              )}
              <Button size="small" type="link" icon={<CopyOutlined />} onClick={() => copy(b.rewritten)}>Copy</Button>
            </Space>
          </div>
        </div>
      ))}
    </Card>
  );
}

function CoverLetterTab({ job, hasResume }) {
  const write = useCoverLetter();
  const save = useUpdateJob();
  const { message } = App.useApp();
  const run = useAiAction(write, 'Cover letter drafted');
  const copy = useCopy();
  const [draft, setDraft] = useState(job.coverLetter);

  if (!hasResume) return <Empty description="Add your resume first." />;
  if (!job.coverLetter) {
    return (
      <Empty description="A short, plain cover letter using only your real experience.">
        <Button type="primary" icon={<RobotOutlined />} loading={write.isPending} onClick={() => run(job._id)}>
          {write.isPending ? 'Writing…' : 'Draft cover letter'}
        </Button>
      </Empty>
    );
  }
  const dirty = draft !== job.coverLetter;
  return (
    <Card
      title="Cover letter"
      extra={
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => copy(draft, 'Cover letter copied')}>Copy</Button>
          <Popconfirm title="Replace your edits with a new draft?" onConfirm={() => run(job._id)} disabled={!dirty}>
            <Button icon={<ReloadOutlined />} loading={write.isPending} onClick={() => !dirty && run(job._id)}>New draft</Button>
          </Popconfirm>
        </Space>
      }
    >
      <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} autoSize={{ minRows: 12 }} maxLength={6000} />
      <Space style={{ marginTop: 12 }}>
        <Button
          type="primary"
          disabled={!dirty}
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ id: job._id, coverLetter: draft });
              message.success('Saved');
            } catch (e) {
              message.error(errorMessage(e));
            }
          }}
        >
          Save changes
        </Button>
        {dirty && <span className="muted">Unsaved changes</span>}
      </Space>
    </Card>
  );
}

function NotesTab({ job, onSave }) {
  const [notes, setNotes] = useState(job.notes ?? '');
  return (
    <Card>
      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} autoSize={{ minRows: 6 }} maxLength={2000} placeholder="Recruiter name, interview dates, questions to ask…" />
      <Button type="primary" style={{ marginTop: 12 }} disabled={notes === (job.notes ?? '')} onClick={() => onSave(notes)}>Save notes</Button>
    </Card>
  );
}

function PostTab({ job }) {
  const d = job.details ?? {};
  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} md={9}>
        <Card title="What the AI found">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Seniority">{d.seniority || '—'}</Descriptions.Item>
            <Descriptions.Item label="Experience">{d.yearsRequired != null ? `${d.yearsRequired}+ years` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Location">{placeLabel(d) || '—'}</Descriptions.Item>
            <Descriptions.Item label="Visa"><SponsorshipTag value={d.sponsorship} /></Descriptions.Item>
          </Descriptions>
          <Typography.Paragraph style={{ marginTop: 12 }}>{d.summary}</Typography.Paragraph>
          <Space size={[4, 8]} wrap>
            {d.requirements?.map((r) => <Tag key={r.skill} color={r.importance === 'required' ? 'blue' : undefined}>{r.skill}</Tag>)}
          </Space>
          <p className="muted" style={{ fontSize: 12 }}>Blue = must-have</p>
        </Card>
      </Col>
      <Col xs={24} md={15}>
        <Card title="Original post"><div className="job-post">{job.description}</div></Card>
      </Col>
    </Row>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { data: job, isLoading, error } = useJob(id);
  const { data: resume } = useResume();
  const update = useUpdateJob();
  const remove = useDeleteJob();

  if (error) {
    return <Result status="404" title="Job not found" extra={<Link to="/board"><Button type="primary">Back to board</Button></Link>} />;
  }
  if (isLoading || !job) return <Skeleton active paragraph={{ rows: 10 }} />;

  const chunks = resume?.chunks ?? [];
  const setField = async (body, done) => {
    try {
      await update.mutateAsync({ id: job._id, ...body });
      if (done) message.success(done);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <Link to="/board"><Button type="text" icon={<ArrowLeftOutlined />} style={{ marginLeft: -12 }}>Board</Button></Link>
      <div className="page-header" style={{ marginTop: 4 }}>
        <div>
          <h1>{job.title}</h1>
          <p className="muted">
            {[job.company, placeLabel(job.details)].filter(Boolean).join(' · ')}
            {job.url && <> · <a href={job.url} target="_blank" rel="noreferrer"><LinkOutlined /> Job post</a></>}
          </p>
        </div>
        <Space wrap>
          <Select
            value={job.status}
            style={{ width: 150 }}
            options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
            onChange={(status) => setField({ status }, `Moved to ${STATUSES.find((s) => s.key === status).label}`)}
            aria-label="Status"
          />
          <Popconfirm
            title="Delete this job?"
            description="Its match report and cover letter will be deleted too."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              await remove.mutateAsync(job._id);
              message.success('Job deleted');
              navigate('/board');
            }}
          >
            <Button danger icon={<DeleteOutlined />} aria-label="Delete job" />
          </Popconfirm>
        </Space>
      </div>

      {job.details?.sponsorship === 'no' && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title="This employer says it will not sponsor visas."
          description={job.details.sponsorshipQuote && `“${job.details.sponsorshipQuote}”`}
        />
      )}

      <Tabs
        defaultActiveKey="match"
        items={[
          { key: 'match', label: 'Match report', children: <MatchTab job={job} chunks={chunks} hasResume={Boolean(resume)} /> },
          { key: 'tailor', label: 'Tailored bullets', children: <TailorTab job={job} hasResume={Boolean(resume)} /> },
          { key: 'letter', label: 'Cover letter', children: <CoverLetterTab key={job.coverLetter} job={job} hasResume={Boolean(resume)} /> },
          { key: 'post', label: 'Job post', children: <PostTab job={job} /> },
          { key: 'notes', label: 'Notes', children: <NotesTab key={job.notes} job={job} onSave={(notes) => setField({ notes }, 'Notes saved')} /> },
        ]}
      />
    </>
  );
}
