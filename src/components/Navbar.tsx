import React, { useState } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  BookOpen,
  FolderTree,
  PlusCircle,
  FileJson,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  LogOut,
  Sliders,
  Menu,
  X,
  Sparkles,
  BrainCircuit,
} from 'lucide-react';
import { UserRole } from '../types';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isSessionStartPending: boolean;
  userRole: UserRole;
  onOpenStudyScope: () => void;
  userProfile: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  onSignOut: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  badge?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  isSessionStartPending,
  userRole,
  onOpenStudyScope,
  userProfile,
  onSignOut,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'learn', label: 'Học ngay', icon: GraduationCap },
    { id: 'rootword', label: 'Gốc từ & Morphology', icon: BrainCircuit },
    { id: 'vocabulary', label: 'Thư viện từ vựng', icon: BookOpen },
    { id: 'decks_tags', label: 'Deck & Tags', icon: FolderTree },
    { id: 'add_word', label: 'Thêm từ mới', icon: PlusCircle },
    { id: 'import_json', label: 'Import JSON', icon: FileJson },
    { id: 'analytics', label: 'Thống kê tiến trình', icon: BarChart3 },
    { id: 'settings', label: 'Cài đặt', icon: SettingsIcon },
  ];

  if (userRole === 'admin') {
    navItems.push({id: 'admin', label: 'Admin', icon: ShieldCheck});
  }

  const handleNavClick = (tabId: string) => {
    onSelectTab(tabId);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <div
          className="flex items-center gap-2.5 cursor-pointer"
          onClick={() => handleNavClick('dashboard')}
        >
          <img src="/lexilearn-logo.svg" alt="LexiLearn" className="w-8 h-8 rounded-lg shadow-md shadow-indigo-100" />
          <span className="font-bold tracking-tight text-lg text-slate-900">LexiLearn</span>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Left Sidebar Layout (Desktop Fixed + Mobile Drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 lg:w-72 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Header / Branding */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => handleNavClick('dashboard')}
          >
            <img src="/lexilearn-logo.svg" alt="LexiLearn" className="w-9 h-9 rounded-xl shadow-md shadow-indigo-100 group-hover:scale-105 transition transform" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-xl text-slate-900">LexiLearn</span>
                <Sparkles className="w-3.5 h-3.5 text-indigo-500 fill-indigo-100" />
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                SRS Adaptive
              </span>
            </div>
          </div>

          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isHighlight = item.highlight;

            return (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                disabled={isSessionStartPending && item.id === 'learn'}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isHighlight
                    ? 'bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 my-2'
                    : isActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-medium'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isHighlight
                        ? 'text-white'
                        : isActive
                        ? 'text-indigo-600'
                        : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer Controls */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
          <div className="flex items-center gap-3 px-1 py-1">
            {userProfile.avatarUrl ? (
              <img
                src={userProfile.avatarUrl}
                alt=""
                className="w-9 h-9 rounded-full border border-slate-200 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                {userProfile.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{userProfile.name}</p>
              <p className="truncate text-xs text-slate-500">{userProfile.email}</p>
            </div>
            {userRole === 'admin' && (
              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Admin</span>
            )}
          </div>

          <button
            type="button"
            aria-label="Đăng xuất"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut className="w-4 h-4" />
            Đăng xuất
          </button>

          {/* Study Scope Toggle Button */}
          <button
            id="btn-open-study-scope"
            onClick={() => {
              onOpenStudyScope();
              setMobileOpen(false);
            }}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 text-xs font-bold transition shadow-2xs"
            title="Chỉnh sửa Study Scope"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>Study Scope</span>
            </div>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
              Config
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
