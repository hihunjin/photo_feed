import React, { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate, useNavigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import BandsPage from './pages/BandsPage';
import FeedsPage from './pages/FeedsPage';
import AlbumsPage from './pages/AlbumsPage';
import ThemeToggle from './components/ThemeToggle';

const TABS = [
  { id: 'bands',  label: 'Bands',        icon: '🎵', path: '/bands' },
  { id: 'feeds',  label: 'Feeds',        icon: '📝', path: '/feeds' },
  { id: 'albums', label: 'Photo Albums', icon: '📷', path: '/albums' },
];

export default function App() {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });
  const [selectedBand, setSelectedBand] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Apply saved theme on mount
  useEffect(() => {
    const saved = localStorage.getItem('photo-feed-theme') || 'light';
    const resolved = saved === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : saved;
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  function handleLogin(nextUser) {
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  // Derive active tab from pathname for the top nav
  const activeTab = TABS.find(tab => location.pathname.includes(tab.path))?.id || 'bands';

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      {/* ── Top Bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="topbar-logo">PF</div>
          <h1>지율이네</h1>
        </div>
        <div className="topbar-actions">
          <span className="topbar-user">{user.username}</span>
          <span className="badge">{user.role}</span>
          <ThemeToggle />
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <nav className="tabs">
        {TABS.map((tab) => {
          // If a band is selected, append the band name to the path
          let toPath = tab.path;
          if (selectedBand && tab.id !== 'bands') {
            toPath = `/${encodeURIComponent(selectedBand.name)}${tab.path}`;
          }
          return (
            <NavLink
              key={tab.id}
              to={toPath}
              className={() => `tab ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.icon} {tab.label}
            </NavLink>
          );
        })}
      </nav>

      {/* ── Tab Content ── */}
      <main className="fade-in" key={location.pathname.split('/')[1] || 'root'}>
        <Routes>
          <Route path="/" element={<Navigate to="/bands" replace />} />
          
          <Route 
            path="/bands" 
            element={
              <BandsPage 
                user={user} 
                selectedBand={selectedBand}
                onSelectBand={(band) => {
                  setSelectedBand(band);
                  navigate(`/${encodeURIComponent(band.name)}/feeds`);
                }}
              />
            } 
          />
          
          {/* Feeds Routes */}
          <Route 
            path="/feeds/*" 
            element={<FeedsPage user={user} selectedBand={selectedBand} onSelectBand={setSelectedBand} />} 
          />
          <Route 
            path="/:bandName/feeds/*" 
            element={<FeedsPage user={user} selectedBand={selectedBand} onSelectBand={setSelectedBand} />} 
          />
          
          {/* Albums Routes */}
          <Route 
            path="/albums/*" 
            element={<AlbumsPage user={user} selectedBand={selectedBand} onSelectBand={setSelectedBand} />} 
          />
          <Route 
            path="/:bandName/albums/*" 
            element={<AlbumsPage user={user} selectedBand={selectedBand} onSelectBand={setSelectedBand} />} 
          />
        </Routes>
      </main>
    </div>
  );
}
