import { NavLink } from 'react-router-dom';

import type { Me } from '../lib/api';

function Tab({
  to,
  label,
  icon,
}: {
  to: string;
  label: string;
  icon: string;
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        'flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ' +
        (isActive ? 'text-tg-link' : 'text-tg-hint')
      }
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}

/** Bottom tab bar. Visible tabs depend on the user's role. */
export function NavBar({ me }: { me: Me }) {
  const isMaster = me.is_master || me.user.role === 'admin';
  const isAdmin = me.user.role === 'admin';
  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-tg-separator flex shadow-soft"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <Tab to="/" label="Главная" icon="🏠" />
      <Tab to="/history" label="Записи" icon="📒" />
      {isMaster && <Tab to="/master" label="Мастер" icon="✂️" />}
      {isAdmin && <Tab to="/admin" label="Админ" icon="⚙️" />}
    </nav>
  );
}
