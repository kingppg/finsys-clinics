import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ---------------------------------------------------------------------------
// CLINIC CONTEXT
// ---------------------------------------------------------------------------
// Provides clinic-level data to any component in the tree.
// Usage:
//   const { clinicId, clinicTimeZone, clinicName } = useClinic();
//
// Add new clinic fields here as needed — no prop drilling required.
// ---------------------------------------------------------------------------

const ClinicContext = createContext(null);

export function ClinicProvider({ clinicId, children }) {
  const [clinicTimeZone, setClinicTimeZone] = useState('Asia/Manila'); // safe fallback
  const [clinicName, setClinicName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clinicId) return;
    supabase
      .from('clinics')
      .select('name, time_zone')
      .eq('id', clinicId)
      .single()
      .then(({ data }) => {
        if (data?.time_zone) setClinicTimeZone(data.time_zone);
        if (data?.name) setClinicName(data.name);
        setLoading(false);
      });
  }, [clinicId]);

  return (
    <ClinicContext.Provider value={{ clinicId, clinicTimeZone, clinicName, loading }}>
      {children}
    </ClinicContext.Provider>
  );
}

// Custom hook for easy consumption anywhere in the tree
export function useClinic() {
  const context = useContext(ClinicContext);
  if (!context) {
    throw new Error('useClinic must be used within a ClinicProvider');
  }
  return context;
}

export default ClinicContext;