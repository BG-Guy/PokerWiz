// "Log out" for the password lock: shown only when the app has a password. Signs out and goes to the login page.
import { useEffect, useState } from 'react';
import { getAuthStatus, logout } from '../../api/auth.js';
import Icon from '../Icon/Icon.jsx';
import './LogoutButton.css';

export default function LogoutButton({ className = '' }) {
  const [enabled, setEnabled] = useState(false);

  // Ask once whether a password is set (no lock: nothing to sign out of).
  useEffect(() => {
    let active = true;
    getAuthStatus()
      .then((status) => active && setEnabled(Boolean(status?.enabled)))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  const signOut = async () => {
    await logout().catch(() => {});
    window.location.assign('/login');
  };

  return (
    <button type="button" className={`logout-button ${className}`} onClick={signOut}>
      <Icon name="lock" size={16} />
      <span>Log out</span>
    </button>
  );
}
