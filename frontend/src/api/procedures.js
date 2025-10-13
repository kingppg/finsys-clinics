import axios from "axios";

// Fetch clinics
export async function fetchClinics() {
  const { data } = await axios.get("/api/clinics");
  return data;
}

// Fetch procedure categories + procedures for a clinic
export async function fetchProcedureCategories(clinicId) {
  const { data } = await axios.get(`/api/clinics/${clinicId}/procedure-categories`);
  return data;
}

// Add procedure
export async function addProcedure(clinicId, categoryId, name, price) {
  return axios.post(`/api/clinics/${clinicId}/procedures`, { categoryId, name, price });
}

// Update procedure
export async function updateProcedure(procedureId, { name, price }) {
  return axios.put(`/api/procedures/${procedureId}`, { name, price });
}

// Delete procedure
export async function deleteProcedure(procedureId) {
  return axios.delete(`/api/procedures/${procedureId}`);
}

// Add category
export async function addProcedureCategory(clinicId, name) {
  return axios.post(`/api/clinics/${clinicId}/procedure-categories`, { name });
}