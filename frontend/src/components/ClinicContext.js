import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const ClinicContext = createContext(null);

export function ClinicProvider({ clinicId, children }) {
  const [clinicTimeZone, setClinicTimeZone] = useState('Asia/Manila'); 
  const [clinicName, setClinicName] = useState('');
  // ─── NEW CURRENCY STATES ──────────────────────────────────────────────────
  const [currencySymbol, setCurrencySymbol] = useState('₱'); // default fallback
  const [currencyLocale, setCurrencyLocale] = useState('en-PH'); // default fallback
  const [vatRegistered, setVatRegistered] = useState(false); // Non-VAT by default
  const [vatRate, setVatRate] = useState(12);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicId) return;
    setLoading(true);

    supabase
      .from('clinics')
      // Make sure 'currency_symbol' and 'currency_locale' exist in your table columns!
      .select('name, time_zone, currency_symbol, currency_locale, vat_registered, vat_rate')
      .eq('id', clinicId)
      .single()
      .then(({ data }) => {
        if (data?.time_zone) setClinicTimeZone(data.time_zone);
        if (data?.name) setClinicName(data.name);
        if (data?.currency_symbol) setCurrencySymbol(data.currency_symbol);
        if (data?.currency_locale) setCurrencyLocale(data.currency_locale);
        setVatRegistered(!!data?.vat_registered);
        if (data?.vat_rate != null) setVatRate(parseFloat(data.vat_rate) || 12);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading clinic context:", err);
        setLoading(false);
      });
  }, [clinicId]);

  return (
    <ClinicContext.Provider 
      value={{
        clinicId,
        clinicTimeZone,
        clinicName,
        currencySymbol,
        currencyLocale,
        vatRegistered,
        vatRate,
        loading
      }}
    >
      {children}
    </ClinicContext.Provider>
  );
}

export function useClinic() {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
}

export default ClinicContext;