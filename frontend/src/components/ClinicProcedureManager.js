import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Swal from "sweetalert2";
import { supabase } from "../supabaseClient";
import { useClinic } from "./ClinicContext"; // ─── CONSUMING CONTEXT
import "./ClinicProcedureManager.css";

// ─── Tiny SVG icon helper ─────────────────────────────────────────────────────
const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) =>
      p.startsWith("M") || p.startsWith("m") ? <path key={i} d={p} /> : <polyline key={i} points={p} />
    )}
  </svg>
);

const I = {
  chevron:  ["M6 9 12 15 18 9"],
  pencil:   ["M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7", "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"],
  trash:    ["M3 6h18", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6M14 11v6", "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"],
  plus:     ["M12 5v14", "M5 12h14"],
  check:    ["M20 6L9 17l-5-5"],
  x:        ["M18 6L6 18", "M6 6l12 12"],
  drag:     ["M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01"],
  search:   ["M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  percent:  ["M19 5L5 19", "M6.5 6.5h.01M17.5 17.5h.01"],
};

const swalConfig = {
  confirmButtonColor: "#0f2340", 
  cancelButtonColor: "#64748b",  
  customClass: {
    confirmButton: "CPM-swal-confirm-btn",
    cancelButton: "CPM-swal-cancel-btn",
  }
};

// ─── Sortable Procedure Row ───────────────────────────────────────────────────
const SortableProcRow = ({ proc, isEditing, editData, onEdit, onSave, onCancel, onDelete, onEditChange }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(proc.id) });
  const { currencySymbol, currencyLocale } = useClinic(); // Dynamic Formats

  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className={`CPM-proc-row${isEditing ? " CPM-row--editing" : ""}`}
    >
      <td className="CPM-drag-cell">
        <span className="CPM-drag-handle" {...attributes} {...listeners} title="Drag to reorder procedure">
          <Icon d={I.drag} size={13} />
        </span>
      </td>
      <td>
        {isEditing ? (
          <input 
            className="CPM-inline-input" 
            value={editData.name ?? ""} 
            onFocus={(e) => e.target.select()}
            onChange={e => onEditChange("name", e.target.value)} 
          />
        ) : (
          <span className="CPM-proc-name">{proc.name}</span>
        )}
      </td>
      <td>
        {isEditing ? (
          <input 
            className="CPM-inline-input CPM-inline-input--price" 
            type="number" 
            value={editData.price ?? ""} 
            onFocus={(e) => e.target.select()}
            onChange={e => onEditChange("price", e.target.value)} 
          />
        ) : (
          <span className="CPM-price">
            {Number(proc.price || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}
          </span>
        )}
      </td>
      <td className="CPM-actions">
        {isEditing ? (
          <>
            <button className="CPM-btn CPM-btn--confirm" onClick={onSave}><Icon d={I.check} /> Save</button>
            <button className="CPM-btn CPM-btn--ghost" onClick={onCancel}><Icon d={I.x} /> Cancel</button>
          </>
        ) : (
          <>
            <button className="CPM-btn CPM-btn--edit" onClick={() => onEdit(proc)}><Icon d={I.pencil} /> Edit</button>
            <button className="CPM-btn CPM-btn--danger" onClick={() => onDelete(proc.id)}><Icon d={I.trash} /> Delete</button>
          </>
        )}
      </td>
    </tr>
  );
};

// ─── Bulk Price Modal ─────────────────────────────────────────────────────────
const BulkModal = ({ categoryName, onApply, onClose }) => {
  const { currencySymbol } = useClinic(); // Dynamic Symbol
  const [mode, setMode]           = useState("percent");
  const [direction, setDirection] = useState("increase");
  const [value, setValue]         = useState("");

  const apply = () => {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return;
    onApply({ mode, direction, value: num });
  };

  return (
    <div className="CPM-modal-backdrop" onClick={onClose}>
      <div className="CPM-modal" onClick={e => e.stopPropagation()}>
        <div className="CPM-modal-header">
          <h3>Bulk Price Edit</h3>
          <p className="CPM-modal-sub">{categoryName}</p>
        </div>
        <div className="CPM-modal-body">
          <div className="CPM-modal-row">
            <label>Type</label>
            <div className="CPM-seg">
              {["percent", "flat"].map(m => (
                <button key={m} className={`CPM-seg-btn${mode === m ? " active" : ""}`} onClick={() => setMode(m)}>
                  {m === "percent" ? "% Percentage" : `${currencySymbol} Flat amount`}
                </button>
              ))}
            </div>
          </div>
          <div className="CPM-modal-row">
            <label>Direction</label>
            <div className="CPM-seg">
              {["increase", "decrease"].map(d => (
                <button key={d} className={`CPM-seg-btn${direction === d ? " active" : ""}`} onClick={() => setDirection(d)}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="CPM-modal-row">
            <label>{mode === "percent" ? "Percentage (%)" : `Amount (${currencySymbol})`}</label>
            <input
              className="CPM-inline-input"
              type="number" min="0" autoFocus
              placeholder={mode === "percent" ? "e.g. 10" : "e.g. 50"}
              value={value}
              onFocus={(e) => e.target.select()}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") apply(); if (e.key === "Escape") onClose(); }}
            />
          </div>
        </div>
        <div className="CPM-modal-footer">
          <button className="CPM-btn CPM-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="CPM-btn CPM-btn--confirm" onClick={apply} disabled={!value || parseFloat(value) <= 0}>
            Apply to All
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Export Helpers ───────────────────────────────────────────────────────────
const exportCSV = (categories) => {
  const rows = [["Category", "Procedure", "Price"]];
  categories.forEach(cat =>
    (cat.procedures ?? []).forEach(p =>
      rows.push([cat.name, p.name, Number(p.price || 0).toFixed(2)])
    )
  );
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
    download: "procedures.csv",
  });
  a.click();
};

const exportPDF = (categories, currencySymbol, currencyLocale) => {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Procedure Price List</title>
  <style>
    body{font-family:Georgia,serif;color:#0f2340;max-width:700px;margin:40px auto;padding:0 20px}
    h1{font-size:1.6rem;margin-bottom:4px}p.sub{color:#64748b;font-size:.85rem;margin-bottom:32px}
    h2{font-size:1.1rem;border-bottom:2px solid #0f2340;padding-bottom:4px;margin-top:28px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{text-align:left;font-size:.75rem;text-transform:uppercase;letter-spacing:.6px;color:#64748b;padding:6px 8px;border-bottom:1px solid #dde6f5}
    td{padding:8px;border-bottom:1px solid #dde6f5;font-size:.95rem}
    td.p{text-align:right;font-variant-numeric:tabular-nums}
    @media print{body{margin:16px}}
  </style></head><body>
  <h1>Clinic Procedure Price List</h1>
  <p class="sub">Generated ${new Date().toLocaleDateString(currencyLocale, {year:"numeric",month:"long",day:"numeric"})}</p>
  ${categories.map(cat => `
    <h2>${cat.name}</h2>
    <table><thead><tr><th>Procedure</th><th style="text-align:right">Price (${currencySymbol})</th></tr></thead>
    <tbody>${(cat.procedures??[]).map(p=>`<tr><td>${p.name}</td><td class="p">${Number(p.price||0).toLocaleString(currencyLocale, {minimumFractionDigits:2})}</td></tr>`).join("")}</tbody>
    </table>`).join("")}
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
};

// ─── Category Card ────────────────────────────────────────────────────────────
const CategoryCard = ({ category, isOpen, onToggle, onProceduresReorder, onRefresh, searchQuery }) => {
  const { clinicId, currencySymbol, currencyLocale } = useClinic();
  const [editingName, setEditName]= useState(false);
  const [catName, setCatName]     = useState(category.name);
  const [editingProc, setEP]      = useState({});   
  const [editData, setED]         = useState({});   
  const [newProc, setNewProc]     = useState({ name: "", price: "" });
  const [addingProc, setAdding]   = useState(false);
  const [showBulk, setShowBulk]   = useState(false);
  const [activeId, setActiveId]   = useState(null);
  const nameRef                   = useRef(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: String(category.id) });

  const innerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  useEffect(() => { if (editingName) nameRef.current?.focus(); }, [editingName]);
  useEffect(() => { setCatName(category.name); }, [category.name]);

  const procedures = [...(category.procedures ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const hasSearch  = !!searchQuery;
  const filtered   = hasSearch
    ? procedures.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : procedures;

  const displayOpen = hasSearch ? true : isOpen;

  const saveCatName = async () => {
    if (!catName.trim()) return;
    await supabase.from("procedure_categories").update({ name: catName.trim() }).eq("id", category.id);
    setEditName(false);
    onRefresh();
  };

  const deleteCat = async () => {
    const n = procedures.length;
    
    const result = await Swal.fire({
      ...swalConfig,
      title: "Are you sure?",
      text: `Delete "${category.name}"${n ? ` and its ${n} procedure${n !== 1 ? "s" : ""}` : ""}? This action cannot be undone.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete category",
      cancelButtonText: "Cancel",
      reverseButtons: true
    });

    if (result.isConfirmed) {
      try {
        await supabase.from("procedures").delete().eq("category_id", category.id);
        await supabase.from("procedure_categories").delete().eq("id", category.id);
        onRefresh();
        
        Swal.fire({
          ...swalConfig,
          title: "Deleted!",
          text: "The category has been successfully removed.",
          icon: "success",
          timer: 1500,
          showConfirmButton: false
        });
      } catch (error) {
        console.error(error);
        Swal.fire({ ...swalConfig, title: "Error", text: "Something went wrong.", icon: "error" });
      }
    }
  };

  const startEdit = (proc) => {
    setEP(p => ({ ...p, [proc.id]: true }));
    setED(p => ({ ...p, [proc.id]: { name: proc.name, price: proc.price } }));
  };
  const cancelEdit = (id) => {
    setEP(p => { const n={...p}; delete n[id]; return n; });
    setED(p => { const n={...p}; delete n[id]; return n; });
  };
  const saveProc = async (proc) => {
    await supabase.from("procedures").update(editData[proc.id]).eq("id", proc.id);
    cancelEdit(proc.id);
    onRefresh();
  };
  
  const deleteProc = async (id) => {
    const result = await Swal.fire({
      ...swalConfig,
      title: "Delete procedure?",
      text: "Are you sure you want to remove this procedure from the panel list?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel",
      reverseButtons: true
    });

    if (result.isConfirmed) {
      try {
        await supabase.from("procedures").delete().eq("id", id);
        onRefresh();

        Swal.fire({
          ...swalConfig,
          title: "Removed",
          text: "Procedure updated from category logs.",
          icon: "success",
          timer: 1200,
          showConfirmButton: false
        });
      } catch (error) {
        console.error(error);
        Swal.fire({ ...swalConfig, title: "Error", text: "Unable to complete processing.", icon: "error" });
      }
    }
  };
  
  const addProc = async () => {
    if (!newProc.name.trim() || !newProc.price) return;
    const maxOrder = procedures.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0);
    await supabase.from("procedures").insert([{
      clinic_id: clinicId, category_id: category.id,
      name: newProc.name.trim(), price: newProc.price,
      sort_order: maxOrder + 1,
    }]);
    setNewProc({ name: "", price: "" });
    setAdding(false);
    onRefresh();
  };

  const applyBulk = async ({ mode, direction, value }) => {
    const sign = direction === "increase" ? 1 : -1;
    
    const upsertPayload = procedures.map(proc => {
      const cur = parseFloat(proc.price || 0);
      const adj = mode === "percent" ? cur + sign * (cur * value / 100) : cur + sign * value;
      return {
        id: proc.id,
        clinic_id: clinicId,
        category_id: category.id,
        name: proc.name,
        sort_order: proc.sort_order,
        price: Math.max(0, Math.round(adj * 100) / 100)
      };
    });

    const { error } = await supabase
      .from("procedures")
      .upsert(upsertPayload, { onConflict: "id" });

    if (error) {
      console.error("Error applying bulk prices:", error);
      Swal.fire({ ...swalConfig, title: "Update Failed", text: "Could not apply batch price changes.", icon: "error" });
    } else {
      setShowBulk(false);
      onRefresh();
      Swal.fire({
        ...swalConfig,
        title: "Success",
        text: "Bulk adjustments completed across procedures.",
        icon: "success",
        timer: 1500,
        showConfirmButton: false
      });
    }
  };

  const procDragEnd = async ({ active, over }) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeStrId = String(active.id);
    const overStrId = String(over.id);

    const oi = procedures.findIndex(p => String(p.id) === activeStrId);
    const ni = procedures.findIndex(p => String(p.id) === overStrId);
    if (oi === -1 || ni === -1) return;

    const reordered = arrayMove(procedures, oi, ni);
    onProceduresReorder(category.id, reordered);

    const upsertPayload = reordered.map((p, i) => ({
      id: p.id,
      clinic_id: clinicId,
      category_id: category.id,
      name: p.name,
      price: p.price,
      sort_order: i
    }));

    const { error } = await supabase
      .from("procedures")
      .upsert(upsertPayload, { onConflict: "id" });

    if (error) {
      console.error("Error updates procedure positions:", error);
      onRefresh();
    }
  };

  const activeProc = activeId ? procedures.find(p => String(p.id) === String(activeId)) : null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className={`CPM-category${displayOpen ? " CPM-category--open" : ""}`}
    >
      {/* ── Header ── */}
      <div className="CPM-cat-header">
        <span className="CPM-drag-handle CPM-cat-drag" {...attributes} {...listeners} title="Drag to reorder category">
          <Icon d={I.drag} size={13} />
        </span>

        <button className="CPM-cat-toggle" onClick={() => !hasSearch && onToggle()}>
          <svg className={`CPM-chevron${displayOpen ? " CPM-chevron--open" : ""}`}
            width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {editingName ? (
          <div className="CPM-cat-name-edit">
            <input 
              ref={nameRef} 
              className="CPM-cat-name-input" 
              value={catName}
              onFocus={(e) => e.target.select()}
              onChange={e => setCatName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveCatName(); if (e.key === "Escape") { setCatName(category.name); setEditName(false); } }}
            />
            <button className="CPM-icon-btn CPM-icon-btn--confirm" onClick={saveCatName}><Icon d={I.check} size={13} /></button>
            <button className="CPM-icon-btn CPM-icon-btn--cancel" onClick={() => { setCatName(category.name); setEditName(false); }}><Icon d={I.x} size={13} /></button>
          </div>
        ) : (
          <div className="CPM-cat-name-display">
            <span className="CPM-cat-name" onClick={() => !hasSearch && onToggle()} style={{ cursor: "pointer" }}>{category.name}</span>
            <span className="CPM-cat-badge">{procedures.length}</span>
            <button className="CPM-icon-btn CPM-icon-btn--edit" onClick={() => setEditName(true)} title="Rename"><Icon d={I.pencil} size={13} /></button>
            <button className="CPM-icon-btn CPM-icon-btn--bulk" onClick={() => setShowBulk(true)} title="Bulk price edit" disabled={procedures.length === 0}>
              <Icon d={I.percent} size={13} />
            </button>
            <button className="CPM-icon-btn CPM-icon-btn--danger" onClick={deleteCat} title="Delete category"><Icon d={I.trash} size={13} /></button>
          </div>
        )}
      </div>

      {/* ── Collapsible Body ── */}
      <div className="CPM-cat-body">
        <div className="CPM-cat-body-inner">
          {filtered.length === 0 && !addingProc && (
            <p className="CPM-empty">{hasSearch ? "No matching procedures." : "No procedures yet."}</p>
          )}

          {filtered.length > 0 && (
            <DndContext sensors={innerSensors} collisionDetection={closestCenter}
              onDragStart={e => setActiveId(e.active.id)}
              onDragEnd={procDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext items={filtered.map(p => String(p.id))} strategy={verticalListSortingStrategy}>
                <table className="CPM-table">
                  <thead>
                    <tr>
                      <th className="CPM-th-drag" />
                      <th>Procedure</th>
                      <th>Price ({currencySymbol})</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(proc => (
                      <SortableProcRow
                        key={proc.id}
                        proc={proc}
                        isEditing={!!editingProc[proc.id]}
                        editData={editData[proc.id] || {}}
                        onEdit={startEdit}
                        onSave={() => saveProc(proc)}
                        onCancel={() => cancelEdit(proc.id)}
                        onDelete={deleteProc}
                        onEditChange={(field, val) =>
                          setED(p => ({ ...p, [proc.id]: { ...p[proc.id], [field]: val } }))
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </SortableContext>
              <DragOverlay>
                {activeProc && (
                  <table className="CPM-table CPM-table--overlay"><tbody>
                    <tr>
                      <td></td>
                      <td><span className="CPM-proc-name">{activeProc.name}</span></td>
                      <td><span className="CPM-price">{Number(activeProc.price || 0).toLocaleString(currencyLocale, { minimumFractionDigits: 2 })}</span></td>
                      <td></td>
                    </tr>
                  </tbody></table>
                )}
              </DragOverlay>
            </DndContext>
          )}

          {!hasSearch && (addingProc ? (
            <div className="CPM-add-proc-row">
              <input className="CPM-inline-input" placeholder="Procedure name" value={newProc.name} autoFocus
                onChange={e => setNewProc(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") addProc(); if (e.key === "Escape") setAdding(false); }}
              />
              <input className="CPM-inline-input CPM-inline-input--price" type="number" placeholder="0.00" value={newProc.price}
                onChange={e => setNewProc(p => ({ ...p, price: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") addProc(); if (e.key === "Escape") setAdding(false); }}
              />
              <button className="CPM-btn CPM-btn--confirm" onClick={addProc} disabled={!newProc.name.trim() || !newProc.price}>
                <Icon d={I.check} /> Add
              </button>
              <button className="CPM-btn CPM-btn--ghost" onClick={() => { setAdding(false); setNewProc({ name: "", price: "" }); }}>
                <Icon d={I.x} /> Cancel
              </button>
            </div>
          ) : (
            <button className="CPM-add-proc-btn" onClick={() => setAdding(true)}>
              <Icon d={I.plus} /> Add Procedure
            </button>
          ))}
        </div>
      </div>

      {showBulk && <BulkModal categoryName={category.name} onApply={applyBulk} onClose={() => setShowBulk(false)} />}
    </div>
  );
};

// ─── Main Container ───────────────────────────────────────────────────────────
const ClinicProcedureManager = () => {
  // Pull dynamic values directly from Context Context — no prop drilling needed!
  const { clinicId, currencySymbol, currencyLocale, loading: contextLoading } = useClinic(); 

  const [categories, setCategories] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat]   = useState(false);
  const [search, setSearch]         = useState("");
  const [showExport, setShowExport] = useState(false);
  
  const storageKey = `CPM_expanded_${clinicId}`;

  const [expandedCats, setExpandedCats] = useState({});
  
  const exportRef = useRef(null);
  
  const globalSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } })
  );

  // Sync localStorage once clinicId is loaded from context
  useEffect(() => {
    if (!clinicId) return;
    try {
      const saved = localStorage.getItem(`CPM_expanded_${clinicId}`);
      if (saved) setExpandedCats(JSON.parse(saved));
    } catch (e) {
      console.error("Error initializing configuration cache mapping:", e);
    }
  }, [clinicId]);

  useEffect(() => {
    if (clinicId) {
      localStorage.setItem(storageKey, JSON.stringify(expandedCats));
    }
  }, [expandedCats, storageKey, clinicId]);

  const fetchCategories = useCallback((preserveCollapses = true) => {
    if (!clinicId) return () => {};
    let isMounted = true;
    setLoading(true);

    supabase
      .from("procedure_categories")
      .select("*, procedures:procedures(*)")
      .eq("clinic_id", clinicId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (!isMounted) return;
        
        const freshData = data || [];
        setCategories(freshData);
        
        if (!preserveCollapses) {
          const saved = localStorage.getItem(`CPM_expanded_${clinicId}`);
          if (!saved) {
            setExpandedCats({});
          }
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [clinicId]);

  useEffect(() => {
    const cleanup = fetchCategories(false);
    return cleanup;
  }, [clinicId, fetchCategories]);

  useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggleCategoryCollapse = (id) => {
    setExpandedCats(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleInnerProceduresReorder = (categoryId, updatedProceduresList) => {
    setCategories(prev => prev.map(cat => {
      if (cat.id === categoryId) {
        return { ...cat, procedures: updatedProceduresList };
      }
      return cat;
    }));
  };

  const addCategory = async () => {
    if (!newCatName.trim() || !clinicId) return;
    const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    
    const { data, error } = await supabase
      .from("procedure_categories")
      .insert([{ clinic_id: clinicId, name: newCatName.trim(), sort_order: maxOrder + 1 }])
      .select();

    if (!error && data?.[0]) {
      setExpandedCats(prev => ({ ...prev, [data[0].id]: true }));
    }
    
    setNewCatName(""); 
    setAddingCat(false);
    fetchCategories(true);
  };

  const catDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id) return;

    const activeStrId = String(active.id);
    const overStrId = String(over.id);

    const oi = categories.findIndex(c => String(c.id) === activeStrId);
    const ni = categories.findIndex(c => String(c.id) === overStrId);
    if (oi === -1 || ni === -1) return;

    const reordered = arrayMove(categories, oi, ni);
    setCategories(reordered);

    const upsertPayload = reordered.map((c, i) => ({
      id: c.id,
      clinic_id: clinicId,
      name: c.name,
      sort_order: i
    }));

    const { error } = await supabase
      .from("procedure_categories")
      .upsert(upsertPayload, { onConflict: "id" });

    if (error) {
      console.error("Error processing category position update:", error);
      fetchCategories(true);
    }
  };

  const totalProcs = categories.reduce((s, c) => s + (c.procedures?.length ?? 0), 0);

  const displayed = search
    ? categories.filter(cat =>
        cat.name.toLowerCase().includes(search.toLowerCase()) ||
        (cat.procedures ?? []).some(p => p.name.toLowerCase().includes(search.toLowerCase()))
      )
    : categories;

  if (contextLoading) {
    return <div className="CPM-loading"><span className="CPM-spinner" /> Syncing clinic configuration data...</div>;
  }

  return (
    <div className="CPM-container">
      {/* ── Sticky Header ── */}
      <div className="CPM-sticky-header">
        <div className="CPM-header-top">
          <div className="CPM-header-title">
            <h2>Procedure Manager</h2>
            <div className="CPM-header-meta">
              <span className="CPM-stat">{categories.length} <em>categories</em></span>
              <span className="CPM-stat-divider">·</span>
              <span className="CPM-stat">{totalProcs} <em>procedures</em></span>
            </div>
          </div>

          <div className="CPM-header-actions">
            {/* Search */}
            <div className="CPM-search-wrap">
              <span className="CPM-search-icon"><Icon d={I.search} size={14} /></span>
              <input className="CPM-search-input" placeholder="Search procedures…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button className="CPM-search-clear" onClick={() => setSearch("")}><Icon d={I.x} size={12} /></button>}
            </div>

            {/* Export */}
            <div className="CPM-export-wrap" ref={exportRef}>
              <button className="CPM-export-btn" onClick={() => setShowExport(m => !m)} disabled={!categories.length}>
                <Icon d={I.download} /> Export
              </button>
              {showExport && (
                <div className="CPM-export-menu">
                  <button onClick={() => { exportCSV(categories); setShowExport(false); }}>Export as CSV</button>
                  <button onClick={() => { exportPDF(categories, currencySymbol, currencyLocale); setShowExport(false); }}>Export as PDF</button>
                </div>
              )}
            </div>

            {/* Add Category */}
            {addingCat ? (
              <div className="CPM-cat-add-form">
                <input className="CPM-cat-add-input" placeholder="Category name" value={newCatName} autoFocus
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
                />
                <button className="CPM-btn CPM-btn--confirm" onClick={addCategory} disabled={!newCatName.trim()}><Icon d={I.check} /> Create</button>
                <button className="CPM-btn CPM-btn--ghost" onClick={() => { setAddingCat(false); setNewCatName(""); }}><Icon d={I.x} /></button>
              </div>
            ) : (
              <button className="CPM-add-cat-btn" onClick={() => setAddingCat(true)}><Icon d={I.plus} /> New Category</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="CPM-body">
        {loading && <div className="CPM-loading"><span className="CPM-spinner" /> Loading…</div>}

        {!loading && !categories.length && (
          <div className="CPM-empty-state">
            <p>No categories yet.</p>
            <button className="CPM-add-cat-btn" onClick={() => setAddingCat(true)}><Icon d={I.plus} /> Create your first category</button>
          </div>
        )}

        {!loading && search && !displayed.length && (
          <div className="CPM-empty-state"><p>No results for "<strong>{search}</strong>".</p></div>
        )}

        {!loading && (
          <DndContext sensors={globalSensors} collisionDetection={closestCenter} onDragEnd={catDragEnd}>
            <SortableContext items={displayed.map(c => String(c.id))} strategy={verticalListSortingStrategy}>
              {displayed.map(cat => (
                <CategoryCard 
                  key={cat.id} 
                  category={cat} 
                  isOpen={!!expandedCats[cat.id]}
                  onToggle={() => toggleCategoryCollapse(cat.id)}
                  onProceduresReorder={handleInnerProceduresReorder}
                  onRefresh={() => fetchCategories(true)} 
                  searchQuery={search} 
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

export default ClinicProcedureManager;