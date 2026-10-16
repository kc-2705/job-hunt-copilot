import { Link } from 'react-router-dom';
import { Button, Card, Progress, Space, Tag } from 'antd';
import { AimOutlined, EditOutlined, FileSearchOutlined, MailOutlined, ProjectOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Brand } from '../components/AppLayout';

const FEATURES = [
  { icon: <FileSearchOutlined />, title: 'Reads any job post', text: 'Paste a posting and get the role, must-have and nice-to-have skills, years required, and whether they sponsor visas.' },
  { icon: <AimOutlined />, title: 'Honest match score', text: 'Every requirement is checked against your resume, with the exact bullet that proves it. No proof, no credit.' },
  { icon: <EditOutlined />, title: 'Tailored bullets', text: 'Your bullets reworded for the job, never with made-up facts. Anything new is flagged for you to check.' },
  { icon: <MailOutlined />, title: 'Cover letter draft', text: 'A short, plain cover letter built only from your real experience. Edit it and copy it in one click.' },
  { icon: <ProjectOutlined />, title: 'Application board', text: 'Drag jobs from Saved to Applied, Interview and Offer, and see your progress at a glance.' },
  { icon: <SafetyCertificateOutlined />, title: 'Open-source AI', text: 'Runs on open-weight models (gpt-oss) with on-server embeddings. Your resume is never used for training.' },
];

export default function Landing() {
  return (
    <>
      <header className="topbar">
        <Brand to="/" />
        <span style={{ flex: 1 }} />
        <Link to="/login"><Button type="text">Log in</Button></Link>
        <Link to="/register"><Button type="primary">Get started</Button></Link>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">AI job search assistant</span>
          <h1>Know your fit before you apply.</h1>
          <p className="lead">
            Job Hunt Copilot compares your resume with any job post, shows exactly where you match and where you don’t,
            rewrites your bullets for the role and drafts the cover letter. Then it keeps every application on one board.
          </p>
          <Space wrap>
            <Link to="/register"><Button type="primary" size="large">Create a free account</Button></Link>
            <Link to="/login"><Button size="large">Try the demo</Button></Link>
          </Space>
        </div>

        <Card>
          <Space align="center" size={16}>
            <Progress type="dashboard" percent={73} size={110} strokeColor="#d97706" />
            <div>
              <div className="display" style={{ fontSize: 20, fontWeight: 700 }}>Senior Full Stack Engineer</div>
              <div className="muted">Brightline Health · Remote</div>
              <Tag color="red" variant="filled" style={{ marginTop: 8 }}>No visa sponsorship</Tag>
            </div>
          </Space>
          <div style={{ marginTop: 16 }}>
            {[
              ['✅', 'React and TypeScript', 'Built a shipment tracking dashboard in React and TypeScript…'],
              ['✅', 'PostgreSQL', 'Modeled order and shipment data in PostgreSQL and added indexes…'],
              ['❌', 'Kubernetes (nice to have)', 'Not found on your resume'],
            ].map(([icon, skill, proof]) => (
              <div key={skill} className="req">
                <span className="icon">{icon}</span>
                <div>
                  <strong>{skill}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>{proof}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.title} className="feature">
            <span style={{ fontSize: 22, color: 'var(--brand)' }}>{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
