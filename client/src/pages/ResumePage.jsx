import { useState } from 'react';
import { Alert, App, Button, Card, Col, Input, Row, Segmented, Skeleton, Space, Typography, Upload } from 'antd';
import { FilePdfOutlined, InboxOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useResume, useSaveResume } from '../api/hooks';
import { errorMessage } from '../api/client';

export default function ResumePage() {
  const { message } = App.useApp();
  const { data: resume, isLoading } = useResume();
  const save = useSaveResume();
  const [mode, setMode] = useState('pdf');
  const [text, setText] = useState('');
  const [error, setError] = useState(null);

  async function submit(payload) {
    setError(null);
    try {
      const r = await save.mutateAsync(payload);
      message.success(`Resume saved: ${r.chunks.length} pieces ready for matching`);
      setText('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Group the chunks by section so the user can see what the AI will search.
  const sections = [];
  for (const c of resume?.chunks ?? []) {
    const name = c.section || 'Header';
    if (sections.at(-1)?.name !== name) sections.push({ name, items: [] });
    sections.at(-1).items.push(c.text);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My resume</h1>
          <p className="muted">The AI splits your resume into bullets and searches them by meaning when it checks a job.</p>
        </div>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={10}>
          <Card title={resume ? 'Replace your resume' : 'Add your resume'}>
            <Segmented
              block
              value={mode}
              onChange={setMode}
              options={[{ value: 'pdf', label: 'Upload PDF' }, { value: 'text', label: 'Paste text' }]}
              style={{ marginBottom: 16 }}
            />
            {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
            {mode === 'pdf' ? (
              <Upload.Dragger
                accept="application/pdf,.pdf"
                showUploadList={false}
                maxCount={1}
                disabled={save.isPending}
                beforeUpload={(file) => {
                  submit({ file });
                  return false; // we send it ourselves
                }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                <p className="ant-upload-text">{save.isPending ? 'Reading your resume…' : 'Click or drop your resume PDF here'}</p>
                <p className="ant-upload-hint">Up to 5 MB. Scanned images can’t be read; paste the text instead.</p>
              </Upload.Dragger>
            ) : (
              <>
                <Input.TextArea rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your whole resume here…" maxLength={30000} />
                <Button type="primary" block style={{ marginTop: 12 }} loading={save.isPending} disabled={text.trim().length < 200} onClick={() => submit({ text })}>
                  Save resume
                </Button>
              </>
            )}
            <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 16, marginBottom: 0 }}>
              Your resume is stored in your account only and is never used to train AI models.
            </Typography.Paragraph>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            title={resume ? <Space><FilePdfOutlined /> {resume.fileName}</Space> : 'What the AI sees'}
            extra={resume && <span className="muted">Updated {dayjs(resume.updatedAt).format('MMM D, YYYY')}</span>}
          >
            {isLoading ? (
              <Skeleton active />
            ) : !resume ? (
              <p className="muted">After you add your resume, its sections and bullets appear here.</p>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>{resume.chunks.length} searchable pieces</p>
                {sections.map((s, i) => (
                  <div key={`${s.name}-${i}`} style={{ marginBottom: 16 }}>
                    <div className="tag-line" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand)' }}>{s.name}</div>
                    <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                      {s.items.map((t, j) => <li key={j} style={{ marginBottom: 4 }}>{t}</li>)}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
