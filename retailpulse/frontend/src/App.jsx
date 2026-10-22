import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Today from './pages/Today.jsx';
import Orders from './pages/Orders.jsx';
import Stock from './pages/Stock.jsx';
import Products from './pages/Products.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import Sales from './pages/Sales.jsx';
import Forecasts from './pages/Forecasts.jsx';
import Insights from './pages/Insights.jsx';
import Import from './pages/Import.jsx';
import DataQuality from './pages/DataQuality.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="d-grid vh-100 place-items-center" style={{ placeItems: 'center' }}><div className="rp-sub">Loading...</div></div>;
  if (!user) return <Routes><Route path="/login" element={<Login />} /><Route path="/register" element={<Login register />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Today />} /><Route path="orders" element={<Orders />} /><Route path="stock" element={<Stock />} />
        <Route path="products" element={<Products />} /><Route path="products/:sku" element={<ProductDetail />} />
        <Route path="sales" element={<Sales />} /><Route path="forecasts" element={<Forecasts />} /><Route path="insights" element={<Insights />} />
        <Route path="import" element={<Import />} /><Route path="quality" element={<DataQuality />} /><Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
