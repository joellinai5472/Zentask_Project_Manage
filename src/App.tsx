import { useState, useMemo, useEffect } from "react";
import {
  Plus, Trash2, Edit3, X, Save, ChevronDown, ChevronRight, ChevronLeft,
  Download, Check, MoreHorizontal, FolderOpen, Square,
  CheckSquare, List, Columns3, Search, Calendar,
  Filter, LayoutDashboard, AlertTriangle,
  Maximize2, Minimize2, Tag, Moon, Sun, GripVertical, Eye, LogOut, User as UserIcon
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "./AuthContext";
import { db, auth, collection, doc, setDoc, onSnapshot, query, deleteDoc } from "./firebase";
import { useThrowAsyncError, handleFirestoreError, OperationType } from "./errors";

// --- Utilities ---
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function renderNotesWithMentions(notes: string) {
  if (!notes) return null;
  const parts = notes.split(/(@\[.*?\]\(.*?\))/g);
  return parts.map((part, i) => {
    const match = part.match(/@\[(.*?)\]\((.*?)\)/);
    if (match) {
      const display = match[1];
      return (
        <span key={i} className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 rounded font-bold">
          @{display}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function getDueDateColor(dueDate: string, isDone: boolean) {
  if (!dueDate) return "";
  if (isDone) return "text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700";
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 font-bold";
  } else if (diffDays <= 7) {
    return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 font-bold";
  } else {
    return "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 font-medium";
  }
}

const PRIORITIES = {
  high: { label: "高優先", color: "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
  medium: { label: "中優先", color: "bg-amber-100 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800" },
  low: { label: "低優先", color: "bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" },
};

const DONE_COL_ID = "__done__";

const PRESET_AVATARS = ['😊','😎','🤩','🦁','🐼','🦊','🐧','🦋','🌟','🚀','🎯','💡','🌈','⚡','🎨','🏆'];

function isEmojiAvatar(str: string) {
  if (!str || str.length > 4) return false;
  return /^\p{Emoji}/u.test(str);
}

function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

// --- Components ---

function ProgressBar({ checklist }: { checklist: any[] }) {
  if (!checklist || !checklist.length) return null;
  const done = checklist.filter(c => c.done).length;
  const pct = (done / checklist.length) * 100;
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex-1 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          className="h-full bg-emerald-500 rounded-full" 
        />
      </div>
      <span className="text-[10px] text-gray-400 dark:text-slate-400 font-bold tabular-nums">{done}/{checklist.length}</span>
    </div>
  );
}

function KanbanCard({ task, onView, onEdit, onDelete, onToggleCheck, onComplete, isDone, onRestore, density = "detailed", onDropOnTask, users }: any) {
  const priority = PRIORITIES[task.priority as keyof typeof PRIORITIES] || PRIORITIES.low;
  const isCompact = density === "compact";
  const [dropPos, setDropPos] = useState<"top" | "bottom" | null>(null);
  const assignee = users?.find((u: any) => u.uid === task.assigneeId);
  
  return (
    <motion.div
      layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} whileHover={{ y: -2 }}
      draggable onDragStart={(e: any) => {
        e.dataTransfer.setData("taskId", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e: any) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        setDropPos(e.clientY < midY ? "top" : "bottom");
      }}
      onDragLeave={() => setDropPos(null)}
      onDrop={(e: any) => {
        e.preventDefault();
        e.stopPropagation();
        setDropPos(null);
        if (onDropOnTask) onDropOnTask(e.dataTransfer.getData("taskId"), task.id, dropPos);
      }}
      onClick={() => onView && onView(task)}
      className={`relative bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer group ${isDone ? "opacity-75" : ""}`}
    >
      {dropPos === "top" && <div className="absolute -top-1.5 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />}
      {dropPos === "bottom" && <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-blue-500 rounded-full z-10" />}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${priority.color}`}>{priority.label}</span>
            {task.tags && task.tags.map((tag: string) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 flex items-center gap-1">
                <Tag size={10} /> {tag}
              </span>
            ))}
            {task.dueDate && (
              <span className={`text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded border ${getDueDateColor(task.dueDate, isDone)}`}>
                <Calendar size={10} /> {task.dueDate}
              </span>
            )}
            {assignee && (
              <span className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 font-bold" title={assignee.displayName}>
                {isEmojiAvatar(assignee.photoURL) ? (
                  <span className="text-[10px] leading-none">{assignee.photoURL}</span>
                ) : assignee.photoURL ? (
                  <img src={assignee.photoURL} alt={assignee.displayName} className="w-3 h-3 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon size={10} />
                )}
                <span className="truncate max-w-[60px]">{assignee.displayName}</span>
              </span>
            )}
          </div>
          <h4 className={`text-sm font-bold leading-tight truncate ${isDone ? "text-gray-400 dark:text-slate-500 line-through" : "text-gray-800 dark:text-slate-100"}`}>{task.title}</h4>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <div className="p-1.5 rounded-lg text-slate-300 dark:text-slate-500 cursor-grab active:cursor-grabbing hover:bg-slate-50 dark:hover:bg-slate-700 hidden sm:block">
            <GripVertical size={14} />
          </div>
          {!isDone && <button onClick={() => onComplete(task.id)} className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-500"><Check size={14} /></button>}
          <button onClick={() => onEdit(task)} className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500"><Edit3 size={14} /></button>
          <button onClick={() => onDelete(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
        </div>
      </div>

      {!isCompact && (
        <>
          {task.notes && <p className="text-xs text-gray-400 dark:text-slate-400 mt-2 line-clamp-2 leading-relaxed">{renderNotesWithMentions(task.notes)}</p>}
          <ProgressBar checklist={task.checklist || []} />
          
          {(task.checklist || []).length > 0 && (
            <div className="mt-3 space-y-1.5">
              {(task.checklist || []).map((c: any) => (
                <button key={c.id} onClick={(e) => { e.stopPropagation(); onToggleCheck(task.id, c.id); }} className="flex items-center gap-2 w-full text-left group/ck">
                  {c.done ? <CheckSquare size={14} className="text-emerald-500 shrink-0" /> : <Square size={14} className="text-gray-200 dark:text-slate-600 group-hover/ck:text-gray-300 dark:group-hover/ck:text-slate-500 shrink-0" />}
                  <span className={`text-[11px] font-medium ${c.done ? "text-gray-300 dark:text-slate-500 line-through" : "text-gray-600 dark:text-slate-300"}`}>{c.text}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-50 dark:border-slate-700 flex items-center justify-between">
            <span className="text-[10px] text-gray-300 dark:text-slate-500 font-medium">{isDone ? `✓ ${task.completedAt}` : `建立於 ${task.createdAt}`}</span>
            {isDone && <button onClick={(e) => { e.stopPropagation(); onRestore(task.id); }} className="text-[10px] font-bold text-blue-500 hover:underline">恢復任務</button>}
          </div>
        </>
      )}
      {isCompact && isDone && (
        <div className="mt-3 flex justify-end">
          <button onClick={(e) => { e.stopPropagation(); onRestore(task.id); }} className="text-[10px] font-bold text-blue-500 hover:underline">恢復任務</button>
        </div>
      )}
    </motion.div>
  );
}

function KanbanColumn({ col, tasks, onDrop, onDropOnTask, onView, onEdit, onDelete, onToggleCheck, onAddTask, onEditCol, onDeleteCol, totalCols, onComplete, density, users }: any) {
  const [over, setOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.name);
  const [menu, setMenu] = useState(false);

  return (
    <div 
      className={`flex flex-col rounded-3xl transition-all h-full ${over ? "bg-blue-50/50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800" : "bg-gray-50/50 dark:bg-slate-800/50"}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} 
      onDrop={(e: any) => { e.preventDefault(); onDrop(e.dataTransfer.getData("taskId"), col.id); setOver(false); }}
    >
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
        {editing ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onBlur={() => { onEditCol(col.id, name); setEditing(false); }} onKeyDown={e => e.key === "Enter" && (onEditCol(col.id, name), setEditing(false))} className="text-sm font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg px-2 py-1 flex-1 outline-none ring-2 ring-blue-100 dark:ring-blue-900 dark:text-white" />
        ) : (
          <span className="text-sm font-black text-gray-700 dark:text-slate-200 flex-1 tracking-tight">{col.name}</span>
        )}
        <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full tabular-nums">{tasks.length}</span>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="p-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-700 transition-colors"><MoreHorizontal size={16} className="text-gray-400 dark:text-slate-500" /></button>
          <AnimatePresence>
            {menu && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 5 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 5 }} className="absolute right-0 top-10 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl shadow-xl py-2 z-30 w-40" onMouseLeave={() => setMenu(false)}>
                <button onClick={() => { setEditing(true); setMenu(false); }} className="w-full text-left px-4 py-2 text-xs font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"><Edit3 size={14} /> 重新命名</button>
                {totalCols > 1 && <button onClick={() => { onDeleteCol(col.id, col.name); setMenu(false); }} className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 flex items-center gap-2"><Trash2 size={14} /> 刪除欄位</button>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex-1 px-3 pb-3 space-y-3 overflow-y-auto scrollbar-hide" style={{ maxHeight: "calc(100vh - 280px)" }}>
        <AnimatePresence mode="popLayout">
          {tasks.map((t: any) => <KanbanCard key={t.id} task={t} onView={onView} onEdit={onEdit} onDelete={onDelete} onToggleCheck={onToggleCheck} onComplete={onComplete} isDone={false} onRestore={() => {}} density={density} onDropOnTask={onDropOnTask} users={users} />)}
        </AnimatePresence>
      </div>

      <button onClick={() => onAddTask(col.id)} className="mx-3 mb-3 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 dark:text-slate-500 text-xs font-bold hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
        <Plus size={16} /> 新增任務
      </button>
    </div>
  );
}

// --- Main App ---

export default function App() {
  const throwAsyncError = useThrowAsyncError();
  const { user, signInWithGoogle, loginWithEmail, registerWithEmail, logout } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [view, setView] = useState("board");
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [isNewTask, setIsNewTask] = useState(false);
  const [showAddCol, setShowAddCol] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [search, setSearch] = useState("");
  
  // Auth states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");
  
  // New States for requested features
  const [newCheck, setNewCheck] = useState("");
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterColumn, setFilterColumn] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [sortBy, setSortBy] = useState("default");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set());
  const [density, setDensity] = useState("detailed");
  const [viewingTask, setViewingTask] = useState<any>(null);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [theme, setTheme] = useState(() => localStorage.getItem("zentask_theme") || "light");
  const [newTag, setNewTag] = useState("");
  
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState("#3b82f6");
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState({ displayName: "", photoURL: "", bio: "", role: "" });
  const [calendarDate, setCalendarDate] = useState(() => new Date());

  const handleUpdateProfile = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", user.uid), {
        displayName: editingProfile.displayName,
        photoURL: editingProfile.photoURL,
        bio: editingProfile.bio,
        role: editingProfile.role,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setShowProfileModal(false);
    } catch (error) {
      console.error("Error updating profile", error);
    }
  };

  // Firebase Data Fetching
  useEffect(() => {
    if (!user) {
      setProjects([]);
      return;
    }

    // Remove ownerId filter to create a shared workspace for all authenticated users
    const q = query(collection(db, "projects"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(loadedProjects);
      
      // If active project is not set or not in the loaded projects, set it to the first one
      if (loadedProjects.length > 0) {
        setActiveProjectId(prev => loadedProjects.some(p => p.id === prev) ? prev : loadedProjects[0].id);
      } else {
        setActiveProjectId("");
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "projects", throwAsyncError);
    });

    const qUsers = query(collection(db, "users"));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const loadedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(loadedUsers);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "users", throwAsyncError);
    });

    return () => {
      unsubscribe();
      unsubscribeUsers();
    };
  }, [user]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("zentask_theme", theme);
  }, [theme]);

  const project = projects.find(p => p.id === activeProjectId) || projects[0];
  
  const updateProject = async (fn: any) => {
    if (!project || !user) return;
    const updatedProject = fn(project);
    
    // Optimistic update
    setProjects(projects.map(p => p.id === activeProjectId ? updatedProject : p));

    try {
      await setDoc(doc(db, "projects", activeProjectId), updatedProject);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}`, throwAsyncError);
      // Revert optimistic update on error (simplified for this example)
    }
  };

  const createNewProject = async () => {
    if (!user) return;
    const np = { 
      id: uid(), 
      name: "新專案", 
      ownerId: user.uid,
      columns: [{ id: uid(), name: "待辦", color: "#94a3b8" }], 
      tasks: [] 
    };
    
    // Optimistic update
    setProjects([...projects, np]);
    setActiveProjectId(np.id);

    try {
      await setDoc(doc(db, "projects", np.id), np);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "projects", throwAsyncError);
    }
  };

  const deleteProject = async (pid: string) => {
    if (!user) return;
    
    // Optimistic update
    const next = projects.filter(p => p.id !== pid);
    setProjects(next);
    if (activeProjectId === pid && next.length > 0) setActiveProjectId(next[0].id);

    try {
      await deleteDoc(doc(db, "projects", pid));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${activeProjectId}`, throwAsyncError);
    }
  };

  const renameProject = async (pid: string, newName: string) => {
    if (!newName.trim() || !user) return;
    const projToUpdate = projects.find(p => p.id === pid);
    if (!projToUpdate) return;

    const updatedProject = { ...projToUpdate, name: newName.trim() };
    
    // Optimistic update
    setProjects(projects.map(proj => proj.id === pid ? updatedProject : proj));

    try {
      await setDoc(doc(db, "projects", pid), updatedProject);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${activeProjectId}`, throwAsyncError);
    }
  };

  // Initialize expanded columns for list view
  useEffect(() => {
    if (project && expandedCols.size === 0) {
      setExpandedCols(new Set([...project.columns.map((c: any) => c.id), DONE_COL_ID]));
    }
  }, [project]);

  const filteredTasks = useMemo(() => {
    if (!project) return [];
    let result = project.tasks.filter((t: any) => {
      if (t._deleted) return false;
      if (search) {
        const s = search.toLowerCase();
        const titleMatch = t.title ? t.title.toLowerCase().includes(s) : false;
        const notesMatch = t.notes ? t.notes.toLowerCase().includes(s) : false;
        if (!titleMatch && !notesMatch) return false;
      }
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterColumn !== "all" && t.columnId !== filterColumn) return false;
      if (filterAssignee !== "all" && t.assigneeId !== filterAssignee) return false;
      if (filterTags.length > 0) {
        if (!t.tags || !t.tags.some((tag: string) => filterTags.includes(tag))) return false;
      }
      return true;
    });

    if (sortBy === "dueDate") {
      result.sort((a: any, b: any) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
    } else if (sortBy === "priority") {
      const pWeight: any = { high: 3, medium: 2, low: 1 };
      result.sort((a: any, b: any) => pWeight[b.priority] - pWeight[a.priority]);
    }
    return result;
  }, [project, search, filterPriority, filterColumn, filterAssignee, sortBy, filterTags]);

  const activeTasks = filteredTasks.filter((t: any) => t.columnId !== DONE_COL_ID);
  const doneTasks = filteredTasks.filter((t: any) => t.columnId === DONE_COL_ID);

  const stats = useMemo(() => {
    if (!project) return { total: 0, done: 0, pct: 0 };
    const total = project.tasks.filter((t: any) => !t._deleted).length;
    const done = project.tasks.filter((t: any) => !t._deleted && t.columnId === DONE_COL_ID).length;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [project]);

  // Handlers
  const dropToCol = (taskId: string, toColId: string) => updateProject((p: any) => {
    const nextTasks = [...p.tasks];
    const idx = nextTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return p;
    const [task] = nextTasks.splice(idx, 1);
    task.columnId = toColId;
    task.completedAt = "";
    nextTasks.push(task);
    return { ...p, tasks: nextTasks };
  });

  const dropToDone = (taskId: string) => updateProject((p: any) => {
    const nextTasks = [...p.tasks];
    const idx = nextTasks.findIndex(t => t.id === taskId);
    if (idx === -1) return p;
    const [task] = nextTasks.splice(idx, 1);
    task.columnId = DONE_COL_ID;
    task.completedAt = new Date().toISOString().slice(0, 10);
    nextTasks.push(task);
    return { ...p, tasks: nextTasks };
  });

  const dropToTask = (sourceId: string, targetId: string, position: "top" | "bottom") => {
    if (sourceId === targetId) return;
    updateProject((p: any) => {
      const nextTasks = [...p.tasks];
      const sourceIdx = nextTasks.findIndex(t => t.id === sourceId);
      if (sourceIdx === -1) return p;
      
      const [sourceTask] = nextTasks.splice(sourceIdx, 1);
      
      const targetIdx = nextTasks.findIndex(t => t.id === targetId);
      if (targetIdx === -1) {
        nextTasks.splice(sourceIdx, 0, sourceTask);
        return p;
      }
      
      sourceTask.columnId = nextTasks[targetIdx].columnId;
      if (sourceTask.columnId === DONE_COL_ID) {
        if (!sourceTask.completedAt) sourceTask.completedAt = new Date().toISOString().slice(0, 10);
      } else {
        sourceTask.completedAt = "";
      }
      
      const insertIdx = position === "top" ? targetIdx : targetIdx + 1;
      nextTasks.splice(insertIdx, 0, sourceTask);
      
      return { ...p, tasks: nextTasks };
    });
  };

  const saveTask = (form: any) => {
    if (form.columnId === DONE_COL_ID && !form.completedAt) form.completedAt = new Date().toISOString().slice(0, 10);
    if (form.columnId !== DONE_COL_ID) form.completedAt = "";
    updateProject((p: any) => ({ 
      ...p, 
      tasks: isNewTask ? [...p.tasks, form] : p.tasks.map((t: any) => t.id === form.id ? form : t) 
    }));
    setEditingTask(null);
    setNewCheck("");
  };

  const toggleCol = (id: string) => {
    const next = new Set(expandedCols);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedCols(next);
  };

  const allTags = useMemo(() => {
    if (!project) return [];
    const tags = new Set<string>();
    project.tasks.forEach((t: any) => {
      if (!t._deleted && t.tags) t.tags.forEach((tag: string) => tags.add(tag));
    });
    return Array.from(tags);
  }, [project]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    filteredTasks.forEach((t: any) => {
      if (t.dueDate) {
        if (!map[t.dueDate]) map[t.dueDate] = [];
        map[t.dueDate].push(t);
      }
    });
    return map;
  }, [filteredTasks]);

  const nodueDateTasks = useMemo(() =>
    filteredTasks.filter((t: any) => !t.dueDate && t.columnId !== DONE_COL_ID),
    [filteredTasks]
  );

  if (!user) {
    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError("");
      try {
        if (isRegistering) {
          await registerWithEmail(email, password);
        } else {
          await loginWithEmail(email, password);
        }
      } catch (err: any) {
        setAuthError(err.message || "發生錯誤，請重試");
      }
    };

    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-900 flex flex-col items-center justify-center p-6 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl p-10 text-center border border-slate-100 dark:border-slate-700">
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard size={40} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">ZenTask</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-8 font-medium leading-relaxed">
            您的跨裝置共用看板。<br/>登入以開始與團隊同步專案與任務。
          </p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6 text-left">
            {authError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium text-center">
                {authError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">電子郵件</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">密碼</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="至少 6 個字元"
              />
            </div>
            <button 
              type="submit"
              className="w-full py-3.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
            >
              {isRegistering ? "註冊帳號" : "登入"}
            </button>
          </form>

          <div className="flex items-center gap-4 mb-6">
            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
            <span className="text-slate-400 text-sm font-medium">或</span>
            <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
          </div>

          <button 
            onClick={signInWithGoogle}
            type="button"
            className="w-full py-3.5 rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-3 mb-6"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            使用 Google 繼續
          </button>

          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setAuthError("");
            }}
            className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
          >
            {isRegistering ? "已經有帳號了？點此登入" : "還沒有帳號？點此註冊"}
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-900 flex flex-col items-center justify-center p-6 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl p-10 text-center border border-slate-100 dark:border-slate-700">
          <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard size={40} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">歡迎來到 ZenTask</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-10 font-medium leading-relaxed">
            您目前沒有任何專案，建立一個新專案開始吧！
          </p>
          <button 
            onClick={createNewProject}
            className="w-full py-4 rounded-2xl bg-blue-600 text-white font-black text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 dark:shadow-blue-900/20 transition-all flex items-center justify-center gap-3"
          >
            <Plus size={20} />
            建立第一個專案
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-100 dark:selection:bg-blue-900/50 transition-colors">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setShowSidebar(true)} className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 hover:shadow-sm transition-all text-slate-600 dark:text-slate-300">
              <FolderOpen size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white truncate">{project.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-24 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div animate={{ width: `${stats.pct}%` }} className="h-full bg-gradient-to-r from-blue-500 to-emerald-500" />
                  </div>
                  <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 tabular-nums">{stats.pct}%</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{stats.done} / {stats.total} 完成</span>
              </div>
            </div>
          </div>

          <div className="flex-1 max-w-xl relative hidden md:flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
              <input 
                type="text" placeholder="搜尋任務、備註..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl py-2.5 pl-11 pr-4 text-sm focus:bg-white dark:focus:bg-slate-900 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all dark:text-white"
              />
            </div>
            
            {/* Filter Dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className={`p-2.5 rounded-2xl border transition-all ${showFilters || filterPriority !== 'all' || filterColumn !== 'all' || filterAssignee !== 'all' || filterTags.length > 0 ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'}`}
              >
                <Filter size={18} />
              </button>
              <AnimatePresence>
                {showFilters && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 top-12 w-72 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-5 z-50"
                  >
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">篩選任務</h4>
                    <div className="space-y-4">
                      {allTags.length > 0 && (
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">標籤</label>
                          <div className="flex flex-wrap gap-1.5">
                            {allTags.map(tag => (
                              <button 
                                key={tag} 
                                onClick={() => setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                className={`text-[10px] px-2 py-1 rounded-lg font-bold border transition-colors ${filterTags.includes(tag) ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' : 'bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">優先級</label>
                        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-medium outline-none dark:text-white">
                          <option value="all">全部優先級</option>
                          <option value="high">🔴 高優先</option>
                          <option value="medium">🟡 中優先</option>
                          <option value="low">🔵 低優先</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">狀態欄位</label>
                        <select value={filterColumn} onChange={e => setFilterColumn(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-medium outline-none dark:text-white">
                          <option value="all">全部狀態</option>
                          {project.columns.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          <option value={DONE_COL_ID}>已完成</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">負責人</label>
                        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-medium outline-none dark:text-white">
                          <option value="all">全部人員</option>
                          {users.map((u: any) => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 block">排序方式</label>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-medium outline-none dark:text-white">
                          <option value="default">預設排序</option>
                          <option value="dueDate">📅 依截止日期</option>
                          <option value="priority">🔥 依優先級</option>
                        </select>
                      </div>
                      {(filterPriority !== "all" || filterColumn !== "all" || filterAssignee !== "all" || sortBy !== "default" || filterTags.length > 0) && (
                        <button onClick={() => { setFilterPriority("all"); setFilterColumn("all"); setFilterAssignee("all"); setSortBy("default"); setFilterTags([]); }} className="w-full py-2 mt-2 text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors">
                          清除篩選與排序
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")} 
              className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 transition-all"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl flex">
              <button onClick={() => setDensity("detailed")} className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${density === "detailed" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`} title="完整顯示"><Maximize2 size={14} /></button>
              <button onClick={() => setDensity("compact")} className={`px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${density === "compact" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`} title="精簡顯示"><Minimize2 size={14} /></button>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl flex">
              <button onClick={() => setView("board")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${view === "board" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}><Columns3 size={14} /> 看板</button>
              <button onClick={() => setView("list")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${view === "list" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}><List size={14} /> 列表</button>
              <button onClick={() => setView("calendar")} className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${view === "calendar" ? "bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"}`}><Calendar size={14} /> 日曆</button>
            </div>
            <button 
              onClick={() => {
                const rows = [["狀態", "標題", "優先級", "標籤", "備註", "建立日期", "截止日期", "完成日期"]];
                project.tasks.filter((t: any) => !t._deleted).forEach((t: any) => {
                  rows.push([t.columnId === DONE_COL_ID ? "已完成" : "進行中", t.title, t.priority, (t.tags || []).join(";"), t.notes, t.createdAt, t.dueDate, t.completedAt || ""]);
                });
                const csv = "\uFEFF" + rows.map(r => r.join(",")).join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${project.name}.csv`; a.click();
              }}
              className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all"
            >
              <Download size={20} />
            </button>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
            {user && (
              <button
                onClick={() => {
                  const currentUserProfile = users.find(u => u.uid === user.uid);
                  setEditingProfile({
                    displayName: currentUserProfile?.displayName || user.displayName || "",
                    photoURL: currentUserProfile?.photoURL || user.photoURL || "",
                    bio: currentUserProfile?.bio || "",
                    role: currentUserProfile?.role || ""
                  });
                  setShowProfileModal(true);
                }}
                className="flex items-center gap-2 p-1.5 pr-3 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              >
                {(() => {
                  const photoURL = users.find((u: any) => u.uid === user.uid)?.photoURL;
                  return isEmojiAvatar(photoURL) ? (
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-lg">{photoURL}</div>
                  ) : photoURL ? (
                    <img src={photoURL} alt="User" className="w-8 h-8 rounded-xl object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <UserIcon size={16} />
                    </div>
                  );
                })()}
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 hidden sm:block max-w-[100px] truncate">
                  {users.find(u => u.uid === user.uid)?.displayName || "使用者"}
                </span>
              </button>
            )}
            <button 
              onClick={logout}
              className="flex items-center gap-2 p-2.5 rounded-2xl bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-all font-bold text-sm"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">登出</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content Area */}
      <main className="flex-1 p-6 max-w-[1600px] mx-auto w-full">
        {view === "board" ? (
          <div className="h-full flex flex-col gap-6">
            <div className="flex-1 overflow-x-auto pb-4">
              <div className="flex gap-6 h-full min-h-[500px]">
                {project.columns.map((col: any) => (
                  <div key={col.id} className="w-80 shrink-0">
                    <KanbanColumn 
                      col={col} tasks={activeTasks.filter((t: any) => t.columnId === col.id)} onDrop={dropToCol}
                      onView={setViewingTask}
                      onEdit={(t: any) => { setEditingTask(t); setIsNewTask(false); }}
                      onDelete={(id: string) => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((t: any) => t.id === id ? { ...t, _deleted: true } : t) }))}
                      onToggleCheck={(tid: string, cid: string) => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((t: any) => t.id === tid ? { ...t, checklist: (t.checklist || []).map((c: any) => c.id === cid ? { ...c, done: !c.done } : c) } : t) }))}
                      onAddTask={(cid: string) => { setEditingTask({ id: uid(), title: "", columnId: cid, priority: "medium", checklist: [], notes: "", tags: [], createdAt: new Date().toISOString().slice(0, 10), dueDate: "" }); setIsNewTask(true); }}
                      onEditCol={(id: string, name: string) => updateProject((p: any) => ({ ...p, columns: p.columns.map((c: any) => c.id === id ? { ...c, name } : c) }))}
                      onDeleteCol={(id: string, name: string) => setConfirmDialog({ isOpen: true, title: "刪除階段欄位", message: `確定要刪除欄位「${name}」嗎？這將會隱藏該欄位下的所有任務。`, onConfirm: () => updateProject((p: any) => ({ ...p, columns: p.columns.filter((c: any) => c.id !== id) })) })}
                      totalCols={project.columns.length} onComplete={dropToDone}
                      density={density} onDropOnTask={dropToTask} users={users}
                    />
                  </div>
                ))}
                <button onClick={() => setShowAddCol(true)} className="w-80 shrink-0 rounded-3xl border-2 border-dashed border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-blue-500 group">
                  <div className="p-4 rounded-2xl bg-white shadow-sm group-hover:scale-110 transition-transform"><Plus size={24} /></div>
                  <span className="text-sm font-black">新增階段欄位</span>
                </button>
              </div>
            </div>

            {/* Done Zone */}
            <div className={`bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all ${showDone ? "flex-1" : "h-16"}`} onDragOver={e => e.preventDefault()} onDrop={(e: any) => dropToDone(e.dataTransfer.getData("taskId"))}>
              <button onClick={() => setShowDone(!showDone)} className="w-full h-16 px-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-white"><Check size={18} strokeWidth={3} /></div>
                  <span className="font-black text-slate-800">已完成任務</span>
                  <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums">{doneTasks.length}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-bold hidden sm:block">拖曳至此標記完成</span>
                  {showDone ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </button>
              {showDone && (
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto max-h-[400px]">
                  <AnimatePresence>
                    {doneTasks.map((t: any) => (
                      <KanbanCard 
                        key={t.id} task={t} isDone={true} onEdit={setEditingTask} onView={setViewingTask}
                        onDelete={(id: string) => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((t: any) => t.id === id ? { ...t, _deleted: true } : t) }))}
                        onRestore={(id: string) => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((t: any) => t.id === id ? { ...t, columnId: project.columns[0].id } : t) }))}
                        onToggleCheck={(tid: string, cid: string) => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((t: any) => t.id === tid ? { ...t, checklist: (t.checklist || []).map((c: any) => c.id === cid ? { ...c, done: !c.done } : c) } : t) }))}
                        onComplete={() => {}}
                        density={density}
                        users={users}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>
        ) : view === "calendar" ? (
          <div className="max-w-5xl mx-auto">
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <button onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() - 1))} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300">
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">
                  {calendarDate.getFullYear()} 年 {calendarDate.getMonth() + 1} 月
                </h2>
                <button onClick={() => setCalendarDate(d => new Date(d.getFullYear(), d.getMonth() + 1))} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300">
                  <ChevronRight size={20} />
                </button>
              </div>
              <button
                onClick={() => { setEditingTask({ id: uid(), title: "", columnId: project.columns[0].id, priority: "medium", checklist: [], notes: "", tags: [], createdAt: new Date().toISOString().slice(0, 10), dueDate: "" }); setIsNewTask(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors shadow-sm">
                <Plus size={16} /> 新增任務
              </button>
            </div>

            {/* Day of week headers */}
            <div className="grid grid-cols-7 mb-2">
              {['日','一','二','三','四','五','六'].map((d, idx) => (
                <div key={d} className={`text-center text-xs font-black py-2 ${idx === 0 ? 'text-rose-400 dark:text-rose-500' : idx === 6 ? 'text-blue-400 dark:text-blue-500' : 'text-slate-400 dark:text-slate-500'}`}>{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {buildCalendarDays(calendarDate.getFullYear(), calendarDate.getMonth()).map((day, i) => {
                const dow = i % 7; // 0=Sun, 6=Sat
                const isWeekend = dow === 0 || dow === 6;
                if (!day) return <div key={i} className={`min-h-[90px] rounded-2xl ${isWeekend ? 'bg-slate-50/60 dark:bg-slate-800/30' : ''}`} />;
                const yr = calendarDate.getFullYear();
                const mo = String(calendarDate.getMonth() + 1).padStart(2, '0');
                const dateStr = `${yr}-${mo}-${String(day).padStart(2, '0')}`;
                const dayTasks = tasksByDate[dateStr] || [];
                const today = new Date();
                const isToday = today.getFullYear() === yr && today.getMonth() === calendarDate.getMonth() && today.getDate() === day;
                const MAX_VISIBLE = 3;
                return (
                  <div key={i} className={`group/day min-h-[90px] rounded-2xl p-2 border transition-colors
                    ${isToday
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                      : isWeekend
                        ? dow === 0
                          ? 'bg-rose-50/60 dark:bg-rose-900/10 border-rose-100 dark:border-rose-900/30 hover:border-rose-200 dark:hover:border-rose-800/50'
                          : 'bg-sky-50/60 dark:bg-sky-900/10 border-sky-100 dark:border-sky-900/30 hover:border-sky-200 dark:hover:border-sky-800/50'
                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-200 dark:hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-black
                        ${isToday ? 'text-blue-600 dark:text-blue-400'
                          : dow === 0 ? 'text-rose-500 dark:text-rose-400'
                          : dow === 6 ? 'text-sky-500 dark:text-sky-400'
                          : 'text-slate-500 dark:text-slate-400'}`}>
                        {day}
                      </span>
                      <button
                        onClick={() => { setEditingTask({ id: uid(), title: "", columnId: project.columns[0].id, priority: "medium", checklist: [], notes: "", tags: [], createdAt: new Date().toISOString().slice(0, 10), dueDate: dateStr }); setIsNewTask(true); }}
                        className="opacity-0 group-hover/day:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-all">
                        <Plus size={11} />
                      </button>
                    </div>
                    {dayTasks.slice(0, MAX_VISIBLE).map((t: any) => (
                      <button key={t.id} onClick={() => setViewingTask(t)}
                        className={`w-full text-left text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-0.5 truncate transition-opacity
                          ${t.columnId === DONE_COL_ID
                            ? 'opacity-40 line-through bg-slate-100 dark:bg-slate-700 text-slate-400'
                            : t.priority === 'high' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:opacity-80'
                            : t.priority === 'medium' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:opacity-80'
                            : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:opacity-80'}`}>
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > MAX_VISIBLE && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">+{dayTasks.length - MAX_VISIBLE} 更多</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* No due date tasks */}
            {nodueDateTasks.length > 0 && (
              <div className="mt-6 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">未設截止日期</h3>
                <div className="space-y-1">
                  {nodueDateTasks.map((t: any) => (
                    <button key={t.id} onClick={() => setViewingTask(t)}
                      className="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-black border shrink-0 ${PRIORITIES[t.priority as keyof typeof PRIORITIES].color}`}>
                        {PRIORITIES[t.priority as keyof typeof PRIORITIES].label}
                      </span>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{t.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* List View with Collapsible Columns */}
            {project.columns.map((col: any) => {
              const colTasks = activeTasks.filter((t: any) => t.columnId === col.id);
              const isOpen = expandedCols.has(col.id);
              return (
                <div key={col.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
                  <div onClick={() => toggleCol(col.id)} className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center gap-3">
                      {isOpen ? <ChevronDown size={18} className="text-slate-400 dark:text-slate-500" /> : <ChevronRight size={18} className="text-slate-400 dark:text-slate-500" />}
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                      <h3 className="font-black text-slate-800 dark:text-slate-100">{col.name}</h3>
                    </div>
                    <span className="text-xs font-black text-slate-400 dark:text-slate-500">{colTasks.length} 任務</span>
                  </div>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {colTasks.length === 0 ? (
                            <div className="px-6 py-8 text-center text-sm font-bold text-slate-300 dark:text-slate-600">此階段尚無任務</div>
                          ) : (
                            colTasks.map((t: any) => (
                              <div key={t.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group">
                                <button onClick={() => dropToDone(t.id)} className="w-6 h-6 rounded-lg border-2 border-slate-200 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors shrink-0" />
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black border shrink-0 ${PRIORITIES[t.priority as keyof typeof PRIORITIES].color}`}>{PRIORITIES[t.priority as keyof typeof PRIORITIES].label}</span>
                                {t.dueDate && (
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md border shrink-0 flex items-center gap-1 ${getDueDateColor(t.dueDate, false)}`}>
                                    <Calendar size={9} />{t.dueDate}
                                  </span>
                                )}
                                <h4 className="flex-1 text-sm font-bold text-slate-800 dark:text-slate-200 truncate min-w-0">{t.title}</h4>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button onClick={() => setViewingTask(t)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500"><Eye size={14} /></button>
                                  <button onClick={() => setEditingTask(t)} className="p-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500"><Edit3 size={14} /></button>
                                  <button onClick={() => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((task: any) => task.id === t.id ? { ...task, _deleted: true } : task) }))} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
            {/* Done Column in List View */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all">
              <div onClick={() => toggleCol(DONE_COL_ID)} className="px-6 py-4 bg-emerald-50/50 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/30 flex items-center justify-between cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors">
                <div className="flex items-center gap-3">
                  {expandedCols.has(DONE_COL_ID) ? <ChevronDown size={18} className="text-emerald-600 dark:text-emerald-500" /> : <ChevronRight size={18} className="text-emerald-600 dark:text-emerald-500" />}
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="font-black text-emerald-800 dark:text-emerald-400">已完成</h3>
                </div>
                <span className="text-xs font-black text-emerald-600 dark:text-emerald-500">{doneTasks.length} 任務</span>
              </div>
              <AnimatePresence>
                {expandedCols.has(DONE_COL_ID) && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                      {doneTasks.length === 0 ? (
                        <div className="px-6 py-8 text-center text-sm font-bold text-slate-300 dark:text-slate-600">尚無已完成任務</div>
                      ) : (
                        doneTasks.map((t: any) => (
                          <div key={t.id} className="px-6 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors group opacity-70">
                            <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0"><Check size={14} className="text-white" strokeWidth={3}/></div>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black border shrink-0 ${PRIORITIES[t.priority as keyof typeof PRIORITIES].color}`}>{PRIORITIES[t.priority as keyof typeof PRIORITIES].label}</span>
                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-500 shrink-0">✓ {t.completedAt}</span>
                            <h4 className="flex-1 text-sm font-bold text-slate-500 dark:text-slate-400 line-through truncate min-w-0">{t.title}</h4>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button onClick={() => setViewingTask(t)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500"><Eye size={14} /></button>
                              <button onClick={() => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((task: any) => task.id === t.id ? { ...task, columnId: project.columns[0].id } : task) }))} className="px-3 py-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold">恢復</button>
                              <button onClick={() => updateProject((p: any) => ({ ...p, tasks: p.tasks.map((task: any) => task.id === t.id ? { ...task, _deleted: true } : task) }))} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400"><Trash2 size={14} /></button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Modals & Overlays */}
      <AnimatePresence>
        {showSidebar && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSidebar(false)} className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50" />
            <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} className="fixed left-0 top-0 bottom-0 w-80 bg-white z-50 shadow-2xl flex flex-col">
              <div className="p-6 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white"><LayoutDashboard size={18} /></div>
                  <span className="font-black text-lg tracking-tight">ZenTask</span>
                </div>
                <button onClick={() => setShowSidebar(false)} className="p-2 rounded-xl hover:bg-slate-100"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">我的專案</div>
                {projects.map(p => (
                  <div key={p.id} className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all group cursor-pointer ${p.id === activeProjectId ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => { setActiveProjectId(p.id); setShowSidebar(false); }}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FolderOpen size={18} className="shrink-0" />
                      {renamingProjectId === p.id ? (
                        <input 
                          autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          onBlur={() => { renameProject(p.id, renameValue); setRenamingProjectId(null); }}
                          onKeyDown={e => { if (e.key === "Enter") { renameProject(p.id, renameValue); setRenamingProjectId(null); } }}
                          className="flex-1 bg-white border border-blue-300 rounded px-2 py-1 text-sm font-bold outline-none text-slate-800"
                        />
                      ) : (
                        <span className="truncate font-bold">{p.name}</span>
                      )}
                    </div>
                    {renamingProjectId !== p.id && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                        <button onClick={(e) => { e.stopPropagation(); setRenamingProjectId(p.id); setRenameValue(p.name); }} className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600"><Edit3 size={14} /></button>
                        {projects.length > 1 && <button onClick={(e) => { e.stopPropagation(); setConfirmDialog({ isOpen: true, title: "刪除專案", message: `確定要刪除專案「${p.name}」嗎？此操作無法復原。`, onConfirm: () => deleteProject(p.id) }); }} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><Trash2 size={14} /></button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-6 border-t space-y-3">
                <button 
                  onClick={createNewProject}
                  className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> 建立新專案
                </button>
              </div>
            </motion.div>
          </>
        )}

        {editingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditingTask(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl w-full max-w-lg z-50 overflow-hidden flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">{isNewTask ? "✨ 新增任務" : "✏️ 編輯任務"}</h3>
                <button onClick={() => setEditingTask(null)} className="p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
              </div>
              <div className="p-8 space-y-6 overflow-y-auto max-h-[70vh]">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">任務名稱</label>
                  <input autoFocus value={editingTask.title} onChange={e => setEditingTask({...editingTask, title: e.target.value})} placeholder="例如：準備週會簡報..." className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 text-base font-bold focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all dark:text-white" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">優先級</label>
                    <select value={editingTask.priority} onChange={e => setEditingTask({...editingTask, priority: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white">
                      <option value="high">🔴 高優先</option>
                      <option value="medium">🟡 中優先</option>
                      <option value="low">🔵 低優先</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">截止日期</label>
                    <input type="date" value={editingTask.dueDate} onChange={e => setEditingTask({...editingTask, dueDate: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">負責人</label>
                    <select value={editingTask.assigneeId || ""} onChange={e => setEditingTask({...editingTask, assigneeId: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white">
                      <option value="">未指派</option>
                      {users.map((u: any) => <option key={u.uid} value={u.uid}>{u.displayName}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">標籤</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(editingTask.tags || []).map((tag: string) => (
                      <span key={tag} className="text-[10px] px-2 py-1 rounded-lg font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 flex items-center gap-1">
                        {tag}
                        <button onClick={() => setEditingTask({...editingTask, tags: editingTask.tags.filter((t: string) => t !== tag)})} className="hover:text-red-500"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      value={newTag} onChange={e => setNewTag(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newTag.trim()) { setEditingTask({...editingTask, tags: [...(editingTask.tags || []), newTag.trim()]}); setNewTag(""); } }}
                      placeholder="新增標籤..."
                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                    />
                    <button 
                      onClick={() => { if (newTag.trim()) { setEditingTask({...editingTask, tags: [...(editingTask.tags || []), newTag.trim()]}); setNewTag(""); } }}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-sm rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                    >
                      新增
                    </button>
                  </div>
                </div>
                
                {/* Checklist Section Restored */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">檢查清單 (Checklist)</label>
                  <div className="space-y-2 mb-3">
                    {(editingTask.checklist || []).map((c: any) => (
                      <div key={c.id} className="flex items-center gap-2 group">
                        <button onClick={() => setEditingTask({...editingTask, checklist: (editingTask.checklist || []).map((item: any) => item.id === c.id ? {...item, done: !item.done} : item)})}>
                          {c.done ? <CheckSquare size={18} className="text-emerald-500" /> : <Square size={18} className="text-slate-300 dark:text-slate-600" />}
                        </button>
                        <input 
                          value={c.text}
                          onChange={e => setEditingTask({...editingTask, checklist: (editingTask.checklist || []).map((item: any) => item.id === c.id ? {...item, text: e.target.value} : item)})}
                          className={`flex-1 bg-transparent border-none outline-none text-sm font-bold ${c.done ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-700 dark:text-slate-200'}`}
                        />
                        <button onClick={() => setEditingTask({...editingTask, checklist: (editingTask.checklist || []).filter((item: any) => item.id !== c.id)})} className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      value={newCheck} onChange={e => setNewCheck(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newCheck.trim()) { setEditingTask({...editingTask, checklist: [...(editingTask.checklist || []), { id: uid(), text: newCheck.trim(), done: false }]}); setNewCheck(""); } }}
                      placeholder="新增檢查項目..."
                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                    />
                    <button 
                      onClick={() => { if (newCheck.trim()) { setEditingTask({...editingTask, checklist: [...(editingTask.checklist || []), { id: uid(), text: newCheck.trim(), done: false }]}); setNewCheck(""); } }}
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-black text-sm rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                    >
                      新增
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">備註說明</label>
                  <textarea
                    value={editingTask.notes || ""}
                    onChange={e => setEditingTask({...editingTask, notes: e.target.value})}
                    placeholder="補充更多細節..."
                    rows={4}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-5 py-3.5 text-sm font-medium focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-50 dark:focus:ring-blue-900/30 outline-none transition-all dark:text-white resize-none"
                  />
                </div>
              </div>
              <div className="p-8 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex gap-4">
                <button onClick={() => setEditingTask(null)} className="flex-1 py-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-black text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-all">取消</button>
                <button onClick={() => editingTask.title.trim() && saveTask(editingTask)} className="flex-1 py-4 rounded-2xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all flex items-center justify-center gap-2"><Save size={18} /> 儲存任務</button>
              </div>
            </motion.div>
          </div>
        )}

        {viewingTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingTask(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-slate-800 rounded-[32px] shadow-2xl w-full max-w-2xl z-50 overflow-hidden flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-lg font-black border ${PRIORITIES[viewingTask.priority as keyof typeof PRIORITIES].color}`}>
                    {PRIORITIES[viewingTask.priority as keyof typeof PRIORITIES].label}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">{viewingTask.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingTask(viewingTask); setIsNewTask(false); setViewingTask(null); }} className="p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-500"><Edit3 size={20} /></button>
                  <button onClick={() => setViewingTask(null)} className="p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={20} /></button>
                </div>
              </div>
              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
                <div className="flex flex-wrap gap-4 text-sm font-bold text-slate-500 dark:text-slate-400">
                  {viewingTask.assigneeId && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800">
                      <UserIcon size={16} /> 負責人：{users.find((u: any) => u.uid === viewingTask.assigneeId)?.displayName || "未知"}
                    </div>
                  )}
                  {viewingTask.dueDate && (
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${getDueDateColor(viewingTask.dueDate, viewingTask.columnId === DONE_COL_ID)}`}>
                      <Calendar size={16} /> 截止日期：{viewingTask.dueDate}
                    </div>
                  )}
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-100 dark:border-slate-700">
                    建立於：{viewingTask.createdAt}
                  </div>
                  {viewingTask.columnId === DONE_COL_ID && (
                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-100 dark:border-emerald-800">
                      <Check size={16} /> 完成於：{viewingTask.completedAt}
                    </div>
                  )}
                </div>

                {viewingTask.tags && viewingTask.tags.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"><Tag size={14} /> 標籤</h4>
                    <div className="flex flex-wrap gap-2">
                      {viewingTask.tags.map((tag: string) => (
                        <span key={tag} className="text-xs px-3 py-1.5 rounded-xl font-bold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {viewingTask.notes && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"><List size={14} /> 備註說明</h4>
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap border border-slate-100 dark:border-slate-800">
                      {renderNotesWithMentions(viewingTask.notes)}
                    </div>
                  </div>
                )}

                {viewingTask.checklist && viewingTask.checklist.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2"><CheckSquare size={14} /> 檢查清單</h4>
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                      <ProgressBar checklist={viewingTask.checklist} />
                      <div className="mt-4 space-y-3">
                        {viewingTask.checklist.map((c: any) => (
                          <div key={c.id} className="flex items-start gap-3">
                            {c.done ? <CheckSquare size={18} className="text-emerald-500 shrink-0 mt-0.5" /> : <Square size={18} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />}
                            <span className={`text-sm font-medium ${c.done ? "text-slate-400 dark:text-slate-500 line-through" : "text-slate-700 dark:text-slate-200"}`}>{c.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {showAddCol && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAddCol(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white rounded-[32px] shadow-2xl w-full max-w-xs z-50 p-8 space-y-6">
              <h3 className="text-lg font-black text-slate-900">新增專案階段</h3>
              <div className="space-y-4">
                <input 
                  autoFocus placeholder="階段名稱 (如：測試中)"
                  value={newColName}
                  onChange={e => setNewColName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && newColName.trim()) { updateProject((p: any) => ({ ...p, columns: [...p.columns, { id: uid(), name: newColName.trim(), color: newColColor }] })); setShowAddCol(false); setNewColName(""); } }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white transition-all"
                />
                <div className="flex gap-2 justify-center py-2">
                  {["#94a3b8", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"].map(c => (
                    <button key={c} onClick={() => setNewColColor(c)} className={`w-6 h-6 rounded-full transition-transform ${newColColor === c ? "scale-125 ring-2 ring-offset-2 ring-blue-400" : "hover:scale-110"}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setShowAddCol(false); setNewColName(""); }} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs">取消</button>
                  <button onClick={() => { if (newColName.trim()) { updateProject((p: any) => ({ ...p, columns: [...p.columns, { id: uid(), name: newColName.trim(), color: newColColor }] })); setShowAddCol(false); setNewColName(""); } }} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black text-xs">確認新增</button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {confirmDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmDialog(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-sm z-[60] p-6 space-y-5 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3 text-red-500">
                <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/30 flex items-center justify-center shrink-0"><AlertTriangle size={20} /></div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{confirmDialog.title}</h3>
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed">{confirmDialog.message}</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setConfirmDialog(null)} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null); }} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-sm hover:bg-red-600 shadow-lg shadow-red-200 dark:shadow-red-900/20 transition-all">確認刪除</button>
              </div>
            </motion.div>
          </div>
        )}

        {showProfileModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowProfileModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }} className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl w-full max-w-md z-[60] border border-slate-100 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="px-8 pt-8 pb-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">編輯個人資料</h3>
                <button onClick={() => setShowProfileModal(false)} className="p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"><X size={18} /></button>
              </div>
              <div className="p-8 space-y-5 overflow-y-auto">
                {/* 頭像預覽 */}
                <div className="flex justify-center">
                  {isEmojiAvatar(editingProfile.photoURL) ? (
                    <div className="w-20 h-20 rounded-3xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center text-5xl">{editingProfile.photoURL}</div>
                  ) : editingProfile.photoURL ? (
                    <img src={editingProfile.photoURL} alt="Preview" className="w-20 h-20 rounded-3xl object-cover border-2 border-slate-200 dark:border-slate-700" referrerPolicy="no-referrer" onError={e => (e.currentTarget.style.display = 'none')} />
                  ) : (
                    <div className="w-20 h-20 rounded-3xl bg-blue-100 dark:bg-blue-900/50 text-blue-500 flex items-center justify-center">
                      <UserIcon size={32} />
                    </div>
                  )}
                </div>

                {/* 預設 emoji 頭像 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">選擇預設頭像</label>
                  <div className="grid grid-cols-8 gap-1.5">
                    {PRESET_AVATARS.map(emoji => (
                      <button key={emoji} onClick={() => setEditingProfile(p => ({ ...p, photoURL: emoji }))}
                        className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center transition-all
                          ${editingProfile.photoURL === emoji
                            ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 scale-110'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 上傳圖片 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">上傳圖片（限 200KB）</label>
                  <input type="file" accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 200 * 1024) { alert('圖片請限制在 200KB 以內'); e.target.value = ''; return; }
                      const reader = new FileReader();
                      reader.onload = () => setEditingProfile(p => ({ ...p, photoURL: reader.result as string }));
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 dark:file:bg-slate-700 file:text-slate-700 dark:file:text-slate-300 file:px-3 file:py-2 file:text-xs file:font-bold cursor-pointer"
                  />
                </div>

                {/* 貼上網址 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">或貼上圖片網址</label>
                  <input type="text"
                    value={isEmojiAvatar(editingProfile.photoURL) || editingProfile.photoURL.startsWith('data:') ? '' : editingProfile.photoURL}
                    onChange={e => setEditingProfile(p => ({ ...p, photoURL: e.target.value }))}
                    placeholder="https://..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                  />
                </div>

                {/* 顯示名稱 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">顯示名稱</label>
                  <input type="text" value={editingProfile.displayName}
                    onChange={e => setEditingProfile(p => ({ ...p, displayName: e.target.value }))}
                    placeholder="輸入您的顯示名稱"
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                  />
                </div>

                {/* 職稱 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">職稱 / 角色（選填）</label>
                  <input type="text" value={editingProfile.role}
                    onChange={e => setEditingProfile(p => ({ ...p, role: e.target.value }))}
                    placeholder="例如：設計師、PM、工程師..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white"
                  />
                </div>

                {/* 自我介紹 */}
                <div>
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 block">自我介紹（選填）</label>
                  <textarea rows={2} value={editingProfile.bio}
                    onChange={e => setEditingProfile(p => ({ ...p, bio: e.target.value }))}
                    placeholder="簡短介紹自己..."
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:bg-white dark:focus:bg-slate-800 transition-all dark:text-white resize-none"
                  />
                </div>
              </div>
              <div className="px-8 py-5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex gap-3">
                <button onClick={() => setShowProfileModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">取消</button>
                <button onClick={handleUpdateProfile} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-black text-sm hover:bg-blue-700 shadow-lg shadow-blue-200 dark:shadow-blue-900/20 transition-all">儲存變更</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
