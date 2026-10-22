import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, getToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: !!getToken(), user: null, tenant: null, stores: [] });
  const [storeId, setStore] = useState(localStorage.getItem('rp_store') || 'all');

  const load = useCallback(async () => {
    if (!getToken()) return setState({ loading: false, user: null, tenant: null, stores: [] });
    try { const me = await api.get('/api/auth/me'); setState({ loading: false, ...me }); }
    catch { setToken(''); setState({ loading: false, user: null, tenant: null, stores: [] }); }
  }, []);
  useEffect(() => { load(); const h = () => setState({ loading: false, user: null, tenant: null, stores: [] }); window.addEventListener('rp-logout', h); return () => window.removeEventListener('rp-logout', h); }, [load]);

  const finish = async (r) => { setToken(r.token); await load(); };
  const value = {
    ...state, storeId,
    setStoreId: (s) => { setStore(s); localStorage.setItem('rp_store', s); },
    login: async (email, password) => finish(await api.post('/api/auth/login', { email, password })),
    register: async (body) => finish(await api.post('/api/auth/register', body)),
    logout: () => { setToken(''); setState({ loading: false, user: null, tenant: null, stores: [] }); },
    reload: load,
    can: (role) => ({ staff: 1, manager: 2, owner: 3 }[state.user?.role] >= { staff: 1, manager: 2, owner: 3 }[role]),
    sp: storeId && storeId !== 'all' ? { storeId } : {},
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
