import { Link, NavLink, Outlet } from 'react-router-dom';
import { Avatar, Button, Dropdown, Tooltip } from 'antd';
import { LogoutOutlined, MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useThemeMode } from '../context/ThemeContext';

export function Brand({ to = '/board' }) {
  return (
    <Link to={to} className="brand">
      <img src="/favicon.svg" alt="" />
      <span>Job Hunt Copilot</span>
    </Link>
  );
}

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { mode, toggle } = useThemeMode();
  const initials = (user?.name ?? '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="nav">
          <NavLink to="/board">Board</NavLink>
          <NavLink to="/resume">My resume</NavLink>
        </nav>
        <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
          <Button type="text" shape="circle" icon={mode === 'dark' ? <SunOutlined /> : <MoonOutlined />} onClick={toggle} aria-label="Toggle dark mode" />
        </Tooltip>
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              { key: 'who', label: <span className="muted">{user?.email}</span>, disabled: true },
              { type: 'divider' },
              { key: 'out', icon: <LogoutOutlined />, label: 'Sign out', onClick: signOut },
            ],
          }}
        >
          <Avatar style={{ background: '#4f46e5', cursor: 'pointer' }} aria-label="Account menu">{initials}</Avatar>
        </Dropdown>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
