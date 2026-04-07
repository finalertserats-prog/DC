import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { theme, setTheme } = useTheme();

    const isActive = (path) => location.pathname.startsWith(path);

    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}'); }
        catch(e) { return {}; }
    })();

    const handleLogout = async () => {
        try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
        localStorage.removeItem('user');
        navigate('/login', { replace: true });
    };

    const avatarLetter = (user.username || 'U')[0].toUpperCase();
    const roleBadge = user.role === 'admin'
        ? 'bg-primary/15 text-primary'
        : 'bg-muted text-muted-foreground';

    return (
        <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col z-30 shrink-0 shadow-sm">
            <div className="h-20 flex items-center px-6 border-b border-sidebar-border shrink-0">
                <button onClick={() => navigate('/')} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center shadow-md">
                        <i className="fas fa-layer-group text-primary-foreground text-lg"></i>
                    </div>
                    <span className="text-xl font-extrabold text-sidebar-foreground tracking-tight">Data Commander</span>
                </button>
            </div>
            <div className="p-4 space-y-2 flex-1">
                <button onClick={() => navigate('/home')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all ${isActive('/home') ? 'bg-primary text-primary-foreground shadow-md' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'}`}>
                    <i className="fas fa-home w-5 text-center text-lg"></i> Home
                </button>
                <button onClick={() => navigate('/connections')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all ${isActive('/connections') ? 'bg-primary text-primary-foreground shadow-md' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'}`}>
                    <i className="fas fa-network-wired w-5 text-center text-lg"></i> Connections
                </button>
                <button onClick={() => navigate('/explore', { state: isActive('/explore') ? location.state : null })} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all ${isActive('/explore') ? 'bg-primary text-primary-foreground shadow-md' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'}`}>
                    <i className="fas fa-compass w-5 text-center text-lg"></i> Explore
                </button>
                <button onClick={() => navigate('/audit')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all ${isActive('/audit') ? 'bg-primary text-primary-foreground shadow-md' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'}`}>
                    <i className="fas fa-clipboard-check w-5 text-center text-lg"></i> Audit
                </button>
                {user.role === 'admin' && (
                    <button onClick={() => navigate('/admin/users')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-bold text-sm transition-all ${isActive('/admin') ? 'bg-primary text-primary-foreground shadow-md' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary'}`}>
                        <i className="fas fa-users-cog w-5 text-center text-lg"></i> Users
                    </button>
                )}
            </div>
            <div className="p-4 border-t border-sidebar-border shrink-0 space-y-2">
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border shadow-sm">
                    <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center text-primary-foreground font-bold text-sm shadow-inner shrink-0">
                        {avatarLetter}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-bold text-foreground leading-tight truncate">{user.username || 'Unknown'}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded w-fit mt-0.5 ${roleBadge}`}>{user.role || 'viewer'}</span>
                    </div>
                    <button onClick={handleLogout} title="Sign out" className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-1">
                        <i className="fas fa-sign-out-alt text-sm"></i>
                    </button>
                </div>
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-primary transition-all"
                    title="Toggle theme"
                >
                    {theme === 'dark'
                        ? <><Sun className="w-4 h-4" /> Light mode</>
                        : <><Moon className="w-4 h-4" /> Dark mode</>
                    }
                </button>
            </div>
        </div>
    );
}
