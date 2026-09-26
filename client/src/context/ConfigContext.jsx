import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';
import { formatMoney } from '../utils/money';
import { todayLocal } from '../utils/format';

const ConfigContext = createContext(null);

const DEFAULTS = { settings: { companyName: 'RideLedger', currencySymbol: '$', allowRiderFeeOverride: true, requireReceiptForExpenses: false }, currentFee: null, today: todayLocal() };

export function ConfigProvider({ children }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rl_config')) || DEFAULTS; } catch { return DEFAULTS; }
  });

  const reload = useCallback(async () => {
    try {
      const res = await api.get('/config');
      setConfig(res.data);
      try { localStorage.setItem('rl_config', JSON.stringify(res.data)); } catch { /* ignore */ }
    } catch { /* keep cached config when offline */ }
  }, []);

  useEffect(() => { if (user) reload(); }, [user, reload]);

  const value = useMemo(() => {
    const symbol = config.settings?.currencySymbol || '$';
    return { ...config, symbol, money: (cents) => formatMoney(cents, symbol), reload };
  }, [config, reload]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
