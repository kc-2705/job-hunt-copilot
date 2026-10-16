import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Form, Input, Modal } from 'antd';
import { useCreateJob } from '../api/hooks';
import { errorMessage } from '../api/client';

/** Paste a job post; the AI reads it, then we open the job so the user can analyze it. */
export default function AddJobModal({ open, onClose }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const create = useCreateJob();
  const [error, setError] = useState(null);

  async function submit() {
    const values = await form.validateFields();
    setError(null);
    try {
      const job = await create.mutateAsync(values);
      message.success(`Added ${job.title}${job.company ? ` at ${job.company}` : ''}`);
      form.resetFields();
      onClose();
      navigate(`/jobs/${job._id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal
      title="Add a job"
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={create.isPending ? 'Reading the job post…' : 'Add job'}
      confirmLoading={create.isPending}
      width={720}
      destroyOnHidden
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Paste the whole job post. The AI pulls out the role, company, required skills and visa sponsorship.
      </p>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 12 }} />}
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          name="description"
          label="Job post"
          rules={[
            { required: true, message: 'Paste the job post.' },
            { min: 200, message: 'Paste the full post (at least a paragraph).' },
          ]}
        >
          <Input.TextArea rows={12} placeholder="Senior Software Engineer at…" maxLength={20000} showCount />
        </Form.Item>
        <Form.Item name="url" label="Link to the post (optional)" rules={[{ type: 'url', message: 'Enter a valid link.' }]}>
          <Input placeholder="https://…" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
