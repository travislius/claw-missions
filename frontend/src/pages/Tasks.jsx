import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ListTodo, Plus, LayoutList, Columns3, Trash2, Pencil, X, ChevronDown, ChevronRight, Clock
} from 'lucide-react';
import api from '../api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoStr) {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const PRIORITY_DOT = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-500',
};

const STATUS_BADGE = {
  backlog:      'bg-slate-600/30 text-slate-400 border-slate-600/60',
  todo:         'bg-gray-600/30 text-gray-300 border-gray-600',
  'in-progress':'bg-sky-500/20 text-sky-400 border-sky-500/40',
  done:         'bg-green-500/20 text-green-400 border-green-500/40',
  blocked:      'bg-red-500/20 text-red-400 border-red-500/40',
};

const STATUS_LABELS = {
  backlog: 'Backlog', todo: 'Todo', 'in-progress': 'In Progress', done: 'Done', blocked: 'Blocked',
};
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];
const STATUS_OPTIONS = ['backlog', 'todo', 'in-progress', 'done', 'blocked'];
const CREATOR_OPTIONS = ['tia', 'travis'];

const BOARD_COLUMNS = ['backlog', 'todo', 'in-progress', 'done', 'blocked'];

// ── Task Form Modal ─────────────────────────────────────────────────────────

function TaskForm({ task, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: '', description: '', status: 'todo', priority: 'medium',
    created_by: 'tia', tags: '', notes: '', due_date: '',
    ...(task || {}),
  });

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave({ ...form, due_date: form.due_date || null });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-white">{task ? 'Edit Task' : 'New Task'}</h2>
          <button type="button" onClick={onCancel} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <input
          autoFocus
          placeholder="Task title *"
          value={form.title}
          onChange={e => set('title', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
        />

        <textarea
          placeholder="Description"
          rows={3}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Status</span>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Priority</span>
            <select value={form.priority} onChange={e => set('priority', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500">
              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Created by</span>
            <select value={form.created_by} onChange={e => set('created_by', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500">
              {CREATOR_OPTIONS.map(c => <option key={c} value={c}>{c === 'tia' ? 'Tia 🌿' : 'Travis'}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs text-gray-400">Due date</span>
            <input type="date" value={form.due_date || ''} onChange={e => set('due_date', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-sky-500" />
          </label>
        </div>

        <input
          placeholder="Tags (comma-separated)"
          value={form.tags}
          onChange={e => set('tags', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sky-500"
        />

        <textarea
          placeholder="Notes"
          rows={2}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-sky-500 resize-none"
        />

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg text-sm bg-sky-600 hover:bg-sky-500 text-white font-medium transition">
            {task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Task Row (List View) ────────────────────────────────────────────────────

function TaskRow({ task, onEdit, onDelete, expanded, onToggle }) {
  const tagList = task.tags ? task.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  return (
    <div className="border-b border-gray-800/60 hover:bg-gray-800/30 transition">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={onToggle}>
        <button className="text-gray-500 hover:text-white shrink-0">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} title={task.priority} />
        <span className="flex-1 text-sm text-white font-medium truncate">{task.title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[task.status] || STATUS_BADGE.todo}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${task.created_by === 'tia' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
          {task.created_by === 'tia' ? 'Tia 🌿' : 'Travis'}
        </span>
        {task.due_date && (
          <span className="text-xs text-gray-500 hidden sm:inline">{task.due_date}</span>
        )}
        <span className="text-xs text-gray-600 hidden sm:inline w-16 text-right">{timeAgo(task.updated_at)}</span>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit(task); }} className="p-1 text-gray-600 hover:text-sky-400 transition"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={e => { e.stopPropagation(); onDelete(task.id); }} className="p-1 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {expanded && (
        <div className="px-12 pb-4 space-y-2 text-sm">
          {task.description && <p className="text-gray-300">{task.description}</p>}
          {task.notes && <p className="text-gray-500 italic">Notes: {task.notes}</p>}
          {tagList.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {tagList.map(tag => (
                <span key={tag} className="text-xs bg-gray-700/50 text-gray-400 px-2 py-0.5 rounded-full">{tag}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task Card (Board View) ──────────────────────────────────────────────────

function TaskCard({ task, onEdit, onDelete, onDragStart }) {
  const tagList = task.tags ? task.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
    if (onDragStart) onDragStart(task.id);
  };

  return (
    <div
      draggable={true}
      onDragStart={handleDragStart}
      className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-3 space-y-2 hover:border-gray-600 transition cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${PRIORITY_DOT[task.priority] || PRIORITY_DOT.medium}`} />
        <span className="flex-1 text-sm text-white font-medium">{task.title}</span>
        <div className="flex gap-0.5 shrink-0">
          <button onClick={() => onEdit(task)} className="p-0.5 text-gray-600 hover:text-sky-400 transition"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => onDelete(task.id)} className="p-0.5 text-gray-600 hover:text-red-400 transition"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      {task.description && <p className="text-xs text-gray-500 line-clamp-2">{task.description}</p>}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-1.5 py-0.5 rounded ${task.created_by === 'tia' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
          {task.created_by === 'tia' ? 'Tia 🌿' : 'Travis'}
        </span>
        {tagList.map(tag => (
          <span key={tag} className="text-xs bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">{tag}</span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-600">
        {task.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{task.due_date}</span>}
        <span className="ml-auto">{timeAgo(task.updated_at)}</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('board'); // list | board
  const [dragOverCol, setDragOverCol] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCreator, setFilterCreator] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [editing, setEditing] = useState(null); // null | 'new' | task object
  const [quickAdd, setQuickAdd] = useState('');
  const pollRef = useRef(null);

  const fetchTasks = useCallback(async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterCreator !== 'all') params.created_by = filterCreator;
      if (filterPriority !== 'all') params.priority = filterPriority;
      const { data } = await api.get('/tasks', { params });
      setTasks(data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCreator, filterPriority]);

  useEffect(() => {
    fetchTasks();
    pollRef.current = setInterval(fetchTasks, 30000);
    return () => clearInterval(pollRef.current);
  }, [fetchTasks]);

  const handleSave = async (form) => {
    try {
      if (editing && editing.id) {
        await api.patch(`/tasks/${editing.id}`, form);
      } else {
        await api.post('/tasks', form);
      }
      setEditing(null);
      fetchTasks();
    } catch (err) {
      console.error('Failed to save task:', err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/tasks/${id}`);
      fetchTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleQuickAdd = async (e) => {
    if (e.key !== 'Enter' || !quickAdd.trim()) return;
    try {
      await api.post('/tasks', { title: quickAdd.trim() });
      setQuickAdd('');
      fetchTasks();
    } catch (err) {
      console.error('Failed to quick-add task:', err);
    }
  };

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;

    const task = tasks.find(t => String(t.id) === taskId);
    if (!task || task.status === newStatus) return;

    // Optimistic update
    const oldTasks = [...tasks];
    setTasks(prev => prev.map(t => String(t.id) === taskId ? { ...t, status: newStatus } : t));

    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
    } catch (err) {
      console.error('Failed to move task:', err);
      setTasks(oldTasks); // revert
    }
  };

  // ── Filter pills ──────────────────────────────────────────────────────

  const Pill = ({ label, active, onClick }) => (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full transition font-medium ${
        active ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  // Filtered tasks (already filtered server-side, but we keep all for board view counts)
  const filteredTasks = tasks;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="w-6 h-6 text-sky-400" />
          <h1 className="text-xl font-bold text-white">Tasks</h1>
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5">
            <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition ${view === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setView('board')} className={`p-1.5 rounded-md transition ${view === 'board' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-white'}`}>
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm px-3 py-2 rounded-lg transition font-medium">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Status:</span>
        <Pill label="All" active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
        {STATUS_OPTIONS.map(s => (
          <Pill key={s} label={s === 'in-progress' ? 'In Progress' : STATUS_LABELS[s]} active={filterStatus === s} onClick={() => setFilterStatus(s)} />
        ))}
        <span className="text-gray-700 mx-1">|</span>
        <span className="text-xs text-gray-500 mr-1">By:</span>
        <Pill label="All" active={filterCreator === 'all'} onClick={() => setFilterCreator('all')} />
        <Pill label="Tia 🌿" active={filterCreator === 'tia'} onClick={() => setFilterCreator('tia')} />
        <Pill label="Travis" active={filterCreator === 'travis'} onClick={() => setFilterCreator('travis')} />
        <span className="text-gray-700 mx-1">|</span>
        <span className="text-xs text-gray-500 mr-1">Priority:</span>
        <Pill label="All" active={filterPriority === 'all'} onClick={() => setFilterPriority('all')} />
        {PRIORITY_OPTIONS.map(p => (
          <Pill key={p} label={p.charAt(0).toUpperCase() + p.slice(1)} active={filterPriority === p} onClick={() => setFilterPriority(p)} />
        ))}
      </div>

      {/* Quick Add */}
      {view === 'list' && (
        <input
          value={quickAdd}
          onChange={e => setQuickAdd(e.target.value)}
          onKeyDown={handleQuickAdd}
          placeholder="New task... (press Enter)"
          className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500/50 transition"
        />
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No tasks yet. Add one to get started!</p>
        </div>
      ) : view === 'list' ? (
        /* ── List View ── */
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
          {filteredTasks.map(task => (
            <TaskRow
              key={task.id}
              task={task}
              expanded={!!expanded[task.id]}
              onToggle={() => toggleExpand(task.id)}
              onEdit={t => setEditing(t)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        /* ── Board View ── */
        <div className="flex gap-3 overflow-x-auto pb-2" style={{ minWidth: 0 }}>
          {BOARD_COLUMNS.map(colStatus => {
            const colTasks = filteredTasks.filter(t => t.status === colStatus);
            return (
              <div
                key={colStatus}
                className={`flex-none w-56 space-y-2 rounded-xl p-2 border transition ${
                  dragOverCol === colStatus ? 'border-sky-500/50 bg-sky-500/5' : 'border-transparent'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(colStatus); }}
                onDragEnter={() => setDragOverCol(colStatus)}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverCol(null); }}
                onDrop={e => handleDrop(e, colStatus)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[colStatus]}`}>
                    {STATUS_LABELS[colStatus]}
                  </span>
                  <span className="text-xs text-gray-600">{colTasks.length}</span>
                </div>
                <div className="space-y-2 min-h-[120px]">
                  {colTasks.map(task => (
                    <TaskCard key={task.id} task={task} onEdit={t => setEditing(t)} onDelete={handleDelete} />
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-xs text-gray-700 text-center py-8 border border-dashed border-gray-800 rounded-lg">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {editing && (
        <TaskForm
          task={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
