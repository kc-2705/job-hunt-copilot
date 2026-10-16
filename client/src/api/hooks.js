import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const get = (url, params) => api.get(url, { params }).then((r) => r.data);

// ---- reads -------------------------------------------------------------

export const useJobs = () => useQuery({ queryKey: ['jobs'], queryFn: () => get('/jobs').then((d) => d.jobs) });
export const useJobStats = () => useQuery({ queryKey: ['job-stats'], queryFn: () => get('/jobs/stats') });
export const useJob = (id) => useQuery({ queryKey: ['job', id], queryFn: () => get(`/jobs/${id}`).then((d) => d.job), enabled: Boolean(id) });
export const useResume = () => useQuery({ queryKey: ['resume'], queryFn: () => get('/resume').then((d) => d.resume) });
export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => get('/ai/status'), staleTime: 5 * 60_000 });

// ---- writes ------------------------------------------------------------

/** After any job change, refresh the board and the job itself (the server returns the updated job). */
function useJobMutation(fn) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (job) => {
      if (job?._id) qc.setQueryData(['job', job._id], job);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job-stats'] });
    },
  });
}

const jobOf = (r) => r.data.job;

export const useCreateJob = () => useJobMutation((body) => api.post('/jobs', body).then(jobOf));
export const useUpdateJob = () => useJobMutation(({ id, ...body }) => api.patch(`/jobs/${id}`, body).then(jobOf));
export const useAnalyzeJob = () => useJobMutation((id) => api.post(`/jobs/${id}/analyze`).then(jobOf));
export const useTailorJob = () => useJobMutation((id) => api.post(`/jobs/${id}/tailor`).then(jobOf));
export const useCoverLetter = () => useJobMutation((id) => api.post(`/jobs/${id}/cover-letter`).then(jobOf));

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/jobs/${id}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: ['job', id] });
      qc.invalidateQueries({ queryKey: ['jobs'] });
      qc.invalidateQueries({ queryKey: ['job-stats'] });
    },
  });
}

export function useSaveResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, text }) => {
      if (file) {
        const form = new FormData();
        form.append('file', file);
        return api.put('/resume', form).then((r) => r.data.resume);
      }
      return api.put('/resume', { text }).then((r) => r.data.resume);
    },
    onSuccess: (resume) => qc.setQueryData(['resume'], resume),
  });
}
