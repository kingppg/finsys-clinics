import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import "./ClinicProcedureManager.css";

/**
 * This version:
 * - Accepts a `clinicId` prop (from context/parent, e.g. user session)
 * - Removes the clinics dropdown and selector logic
 * - All actions (fetch, add, edit, delete categories/procedures) are scoped to that one clinic
 * - Keeps all other UI/logic unchanged
 */
const ClinicProcedureManager = ({ clinicId }) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState({});
  const [newProcedure, setNewProcedure] = useState({
    categoryId: "",
    name: "",
    price: "",
  });
  const [newCategoryName, setNewCategoryName] = useState("");

  // Fetch categories (with procedures) for the given clinic
  useEffect(() => {
    if (clinicId) {
      setLoading(true);
      supabase
        .from("procedure_categories")
        .select("*, procedures:procedures(*)")
        .eq("clinic_id", clinicId)
        .then(({ data }) => setCategories(data || []))
        .finally(() => setLoading(false));
    }
  }, [clinicId]);

  const handleEdit = (procedureId, field, value) => {
    setEditing({
      ...editing,
      [procedureId]: {
        ...editing[procedureId],
        [field]: value,
      },
    });
  };

  const handleSave = async (procedure) => {
    await supabase
      .from("procedures")
      .update(editing[procedure.id])
      .eq("id", procedure.id);
    // refresh categories after edit
    supabase
      .from("procedure_categories")
      .select("*, procedures:procedures(*)")
      .eq("clinic_id", clinicId)
      .then(({ data }) => setCategories(data || []));
    setEditing({});
  };

  const handleDelete = async (procedureId) => {
    if (window.confirm("Are you sure you want to delete this procedure?")) {
      await supabase.from("procedures").delete().eq("id", procedureId);
      supabase
        .from("procedure_categories")
        .select("*, procedures:procedures(*)")
        .eq("clinic_id", clinicId)
        .then(({ data }) => setCategories(data || []));
    }
  };

  const handleAddProcedure = async () => {
    if (
      !newProcedure.name ||
      !newProcedure.price ||
      !newProcedure.categoryId
    )
      return;
    await supabase.from("procedures").insert([
      {
        clinic_id: clinicId,
        category_id: newProcedure.categoryId,
        name: newProcedure.name,
        price: newProcedure.price,
      },
    ]);
    supabase
      .from("procedure_categories")
      .select("*, procedures:procedures(*)")
      .eq("clinic_id", clinicId)
      .then(({ data }) => setCategories(data || []));
    setNewProcedure({ categoryId: "", name: "", price: "" });
  };

  const handleAddCategory = async () => {
    if (!newCategoryName || !clinicId) return;
    await supabase
      .from("procedure_categories")
      .insert([{ clinic_id: clinicId, name: newCategoryName }]);
    supabase
      .from("procedure_categories")
      .select("*, procedures:procedures(*)")
      .eq("clinic_id", clinicId)
      .then(({ data }) => setCategories(data || []));
    setNewCategoryName("");
  };

  return (
    <div className="ClinicProcedureManager-container">
      {/* Sticky header start */}
      <div className="ClinicProcedureManager-sticky-header">
        <h2>Clinic Procedure Manager</h2>
        <div className="ClinicProcedureManager-category-add">
          <input
            className="ClinicProcedureManager-input"
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            placeholder="New category name"
          />
          <button
            onClick={handleAddCategory}
            disabled={!newCategoryName}
          >
            Add Category
          </button>
        </div>
      </div>
      {/* Sticky header end */}
      {loading && <p>Loading...</p>}
      {!loading && (
        <div>
          {categories.map((category) => (
            <div
              key={category.id}
              className="ClinicProcedureManager-category"
            >
              <h3>{category.name}</h3>
              <table className="ClinicProcedureManager-table">
                <thead>
                  <tr>
                    <th>Procedure</th>
                    <th>Price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {category.procedures.map((proc) => (
                    <tr key={proc.id}>
                      <td>
                        {editing[proc.id] ? (
                          <input
                            value={editing[proc.id].name}
                            onChange={(e) =>
                              handleEdit(proc.id, "name", e.target.value)
                            }
                          />
                        ) : (
                          proc.name
                        )}
                      </td>
                      <td>
                        {editing[proc.id] ? (
                          <input
                            type="number"
                            value={editing[proc.id].price}
                            onChange={(e) =>
                              handleEdit(proc.id, "price", e.target.value)
                            }
                          />
                        ) : (
                          `₱${proc.price || "0.00"}`
                        )}
                      </td>
                      <td>
                        {editing[proc.id] ? (
                          <>
                            <button onClick={() => handleSave(proc)}>
                              Save
                            </button>
                            <button
                              onClick={() =>
                                setEditing({
                                  ...editing,
                                  [proc.id]: undefined,
                                })
                              }
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                setEditing({
                                  ...editing,
                                  [proc.id]: {
                                    name: proc.name,
                                    price: proc.price,
                                  },
                                })
                              }
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(proc.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <input
                        value={
                          newProcedure.categoryId === category.id
                            ? newProcedure.name
                            : ""
                        }
                        onChange={(e) =>
                          setNewProcedure({
                            ...newProcedure,
                            categoryId: category.id,
                            name: e.target.value,
                          })
                        }
                        placeholder="New procedure name"
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={
                          newProcedure.categoryId === category.id
                            ? newProcedure.price
                            : ""
                        }
                        onChange={(e) =>
                          setNewProcedure({
                            ...newProcedure,
                            categoryId: category.id,
                            price: e.target.value,
                          })
                        }
                        placeholder="₱0.00"
                      />
                    </td>
                    <td>
                      <button
                        onClick={handleAddProcedure}
                        disabled={
                          !newProcedure.name ||
                          !newProcedure.price ||
                          newProcedure.categoryId !== category.id
                        }
                      >
                        Add
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ClinicProcedureManager;