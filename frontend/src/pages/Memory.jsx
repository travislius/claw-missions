import { useState, useEffect } from 'react';
import { Brain, Sparkles, FileText, ChevronDown, ChevronRight, Lock } from 'lucide-react';
import api from '../api';

function renderMarkdown(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Bold: **text**
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code: `text`
    line = line.replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-pink-400 px-1 py-0.5 rounded text-xs">$1</code>');
    // Links: [text](url)
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-400 underline" target="_blank" rel="noopener">$1</a>');

    // Headers
    if (line.startsWith('#### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h4 class="text-sm font-bold text-gray-200 mt-4 mb-1">${line.slice(5)}</h4>`;
    } else if (line.startsWith('### ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h3 class="text-base font-bold text-gray-100 mt-5 mb-1">${line.slice(4)}</h3>`;
    } else if (line.startsWith('## ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h2 class="text-lg font-bold text-white mt-6 mb-2 border-b border-gray-700 pb-1">${line.slice(3)}</h2>`;
    } else if (line.startsWith('# ')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<h1 class="text-xl font-bold text-white mt-6 mb-2">${line.slice(2)}</h1>`;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { html += '<ul class="list-disc list-inside space-y-0.5 text-gray-300">'; inList = true; }
      html += `<li class="text-sm leading-relaxed">${line.slice(2)}</li>`;
    } else if (line.startsWith('---')) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<hr class="border-gray-700 my-4" />';
    } else if (line.trim() === '') {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<div class="h-2"></div>';
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p class="text-sm text-gray-300 leading-relaxed">${line}</p>`;
    }
  }
  if (inList) html += '</ul>';
  return html;
}

function Section({ icon: Icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-800/50 transition text-left"
      >
        <Icon className="w-5 h-5 text-gray-400 shrink-0" />
        <span className="text-base font-semibold text-white flex-1">{title}</span>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-500" />
          : <ChevronRight className="w-4 h-4 text-gray-500" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-gray-800">
          <div className="pt-4 max-h-[70vh] overflow-y-auto">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Memory() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/system/memory')
      .then(r => setData(r.data))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-400 py-12">
        <p>Failed to load memory: {error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <Brain className="w-7 h-7 text-red-400" />
        <h1 className="text-2xl font-bold text-white">Memory</h1>
      </div>

      {/* Privacy note */}
      <div className="flex items-center gap-2 text-gray-500 text-xs bg-gray-900/50 rounded-lg px-4 py-2.5 border border-gray-800/50">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>This is Tia's private memory — visible only to you</span>
      </div>

      {/* Soul */}
      <Section icon={Sparkles} title="Soul 🌿" defaultOpen={false}>
        {data?.soul ? (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(data.soul) }} />
        ) : (
          <p className="text-gray-500 text-sm italic">No soul file found</p>
        )}
      </Section>

      {/* Long-term Memory */}
      <Section icon={Brain} title="Long-term Memory 🧠" defaultOpen={false}>
        {data?.memory ? (
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(data.memory) }} />
        ) : (
          <p className="text-gray-500 text-sm italic">No memory file found</p>
        )}
      </Section>

      {/* Recent Daily Logs */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4">
          <FileText className="w-5 h-5 text-gray-400" />
          <span className="text-base font-semibold text-white">Recent Logs 📝</span>
        </div>
        <div className="px-5 pb-5 border-t border-gray-800 space-y-3 pt-4">
          {data?.daily?.length > 0 ? (
            data.daily.map((entry, idx) => (
              <DailyEntry key={entry.date} entry={entry} defaultOpen={idx === 0} />
            ))
          ) : (
            <p className="text-gray-500 text-sm italic">No daily logs found</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DailyEntry({ entry, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-800 transition text-left"
      >
        <span className="text-sm font-medium text-gray-200 flex-1">{entry.date}</span>
        {open
          ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        }
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-700/50">
          <div className="pt-3 max-h-[50vh] overflow-y-auto">
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.content) }} />
          </div>
        </div>
      )}
    </div>
  );
}
