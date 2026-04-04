import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT token into every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clawmissions_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 → redirect to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('clawmissions_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (username, password) =>
  api.post('/auth/login', { username, password });

export const refreshToken = () => api.post('/auth/refresh');

// Files
export const getFiles = (params) => api.get('/files', { params });
export const getFile = (id) => api.get(`/files/${id}`);
export const downloadFile = (id) => api.get(`/files/${id}/download`, { responseType: 'blob' });
export const getThumb = (id) => { const token = localStorage.getItem('clawmissions_token'); return `/api/files/${id}/thumb?token=${token}`; };
export const deleteFile = (id) => api.delete(`/files/${id}`);
export const updateFile = (id, data) => api.put(`/files/${id}`, data);
export const uploadFiles = (formData, onProgress) =>
  api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  });

// Search
export const searchFiles = (q) => api.get('/files/search', { params: { q } });

// Tags
export const getTags = () => api.get('/tags');
export const createTag = (data) => api.post('/tags', data);
export const updateTag = (id, data) => api.put(`/tags/${id}`, data);
export const deleteTag = (id) => api.delete(`/tags/${id}`);
export const assignTags = (fileId, tagIds) => api.post(`/files/${fileId}/tags`, { tag_ids: tagIds });
export const removeTag = (fileId, tagId) => api.delete(`/files/${fileId}/tags/${tagId}`);

// Bulk operations
export const bulkAssignTags = (fileIds, tagIds) =>
  api.post('/files/bulk/tags', { file_ids: fileIds, tag_ids: tagIds });
export const bulkDeleteFiles = (fileIds) =>
  api.post('/files/bulk/delete', { file_ids: fileIds });

// Stats
export const getStats = () => api.get('/stats');

// Notes
export const getNoteCategories = () => api.get('/notes/categories');
export const updateNoteCategory = (categoryId, data) => api.put(`/notes/categories/${categoryId}`, data);
export const getCategoryNotes = (categoryId) => api.get(`/notes/categories/${categoryId}/notes`);
export const getNote = (noteId) => api.get(`/notes/notes/${noteId}`);
export const createNote = (data) => api.post('/notes/notes', data);
export const updateNote = (noteId, data) => api.put(`/notes/notes/${noteId}`, data);
export const createNoteReply = (noteId, data) => api.post(`/notes/notes/${noteId}/replies`, data);
export const updateNoteReply = (replyId, data) => api.put(`/notes/replies/${replyId}`, data);
export const getNotesSummary = () => api.get('/notes/summary');

export default api;
