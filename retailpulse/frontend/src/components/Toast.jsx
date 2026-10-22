import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast as BsToast, ToastContainer } from 'react-bootstrap';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((variant, text) => { const id = Math.random(); setItems((a) => [...a, { id, variant, text }]); setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), 4500); }, []);
  const api = { success: (t) => push('success', t), error: (t) => push('danger', t), info: (t) => push('secondary', t) };
  return (
    <Ctx.Provider value={api}>
      {children}
      <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 2000 }}>
        {items.map((x) => (
          <BsToast key={x.id} bg={x.variant} onClose={() => setItems((a) => a.filter((y) => y.id !== x.id))} show>
            <BsToast.Body className={x.variant === 'secondary' ? '' : 'text-white'}>{x.text}</BsToast.Body>
          </BsToast>
        ))}
      </ToastContainer>
    </Ctx.Provider>
  );
}
