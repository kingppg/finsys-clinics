import React, { useState, useEffect, useRef } from 'react';
import Swal from 'sweetalert2';

// ============================================================================
// InvoiceLineItems — the shared line-item builder.
// ----------------------------------------------------------------------------
// One source of truth for adding invoice line items (from the Procedures
// catalog or a custom entry) and rendering the items table. It is CONTROLLED:
// the parent owns the items array and the persistence semantics, so the exact
// same UI serves two flows without drift:
//   • Invoice Management modal  → persisted mode: onAddItem writes to the DB
//     immediately (existing invoice), onDeleteItem deletes by id.
//   • Create Invoice modal      → staged mode: onAddItem appends to in-memory
//     state, onDeleteItem removes it; nothing is written until "Create".
// onAddItem receives { procedure_id, description, quantity, unit_price }.
// ============================================================================

const Icon = ({ d, size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((p, i) =>
      p.startsWith('M') || p.startsWith('m') ? <path key={i} d={p} /> : <polyline key={i} points={p} />
    )}
  </svg>
);

const I = {
  trash:  ['M3 6h18', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6', 'M10 11v6', 'M14 11v6', 'M9 6V4h6v2'],
  plus:   ['M12 5v14', 'M5 12h14'],
  check:  ['M20 6L9 17l-5-5'],
  search: ['M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z'],
};

function InvoiceLineItems({ items, procedures, onAddItem, onDeleteItem, onToggleEligible, fmt, currencySymbol, busy = false }) {
  const [addMode, setAddMode] = useState(null); // 'procedure' | 'custom'
  const [procSearch, setProcSearch] = useState('');
  const [procDropdownVisible, setProcDropdownVisible] = useState(false);
  const [filteredProcs, setFilteredProcs] = useState([]);
  const [selectedProc, setSelectedProc] = useState(null);
  const [itemQty, setItemQty] = useState(1);
  const [itemUnitPrice, setItemUnitPrice] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemEligible, setItemEligible] = useState(true); // SC/PWD eligible

  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProcDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const resetForm = () => {
    setProcSearch('');
    setSelectedProc(null);
    setItemQty(1);
    setItemUnitPrice('');
    setItemDesc('');
    setItemEligible(true);
    setFilteredProcs([]);
    setProcDropdownVisible(false);
  };

  const handleProcSearch = (e) => {
    const val = e.target.value;
    setProcSearch(val);
    setSelectedProc(null);
    if (val.trim().length > 0) {
      setFilteredProcs((procedures || []).filter(p => p.name.toLowerCase().includes(val.toLowerCase())));
      setProcDropdownVisible(true);
    } else {
      setFilteredProcs([]);
      setProcDropdownVisible(false);
    }
    setItemUnitPrice('');
  };

  const handleSelectProc = (proc) => {
    setSelectedProc(proc);
    setProcSearch(proc.name);
    setItemUnitPrice(proc.price || '');
    setItemEligible(proc.sc_pwd_eligible !== false); // inherit catalog eligibility
    setProcDropdownVisible(false);
    setFilteredProcs([]);
  };

  const handleSubmit = () => {
    const desc = addMode === 'procedure' ? (selectedProc?.name || procSearch) : itemDesc;
    const price = parseFloat(itemUnitPrice);
    const qty = parseFloat(itemQty);

    if (!desc || !desc.trim()) {
      Swal.fire({ icon: 'warning', title: 'Missing description', text: 'Please enter a description.', timer: 1800, showConfirmButton: false });
      return;
    }
    if (!price || price <= 0) {
      Swal.fire({ icon: 'warning', title: 'Invalid price', text: 'Please enter a valid unit price.', timer: 1800, showConfirmButton: false });
      return;
    }
    if (!qty || qty <= 0) {
      Swal.fire({ icon: 'warning', title: 'Invalid quantity', text: 'Please enter a valid quantity.', timer: 1800, showConfirmButton: false });
      return;
    }

    onAddItem({
      procedure_id: addMode === 'procedure' ? (selectedProc?.id || null) : null,
      description: desc.trim(),
      quantity: qty,
      unit_price: price,
      sc_pwd_eligible: itemEligible,
    });

    resetForm();
    setAddMode(null);
  };

  return (
    <div className="inv-mgmt-section">
      <div className="inv-mgmt-section-title">
        Line Items
        <div className="inv-mgmt-add-btns">
          <button type="button" className="inv-add-btn" onClick={() => { resetForm(); setAddMode('procedure'); }}>
            <Icon d={I.search} size={12} /> From Procedures
          </button>
          <button type="button" className="inv-add-btn inv-add-btn-custom" onClick={() => { resetForm(); setAddMode('custom'); }}>
            <Icon d={I.plus} size={12} /> Custom Item
          </button>
        </div>
      </div>

      {/* Add Item Form */}
      {addMode && (
        <div className="inv-add-item-form">
          {addMode === 'procedure' ? (
            <div className="inv-add-row" ref={dropdownRef}>
              <div className="inv-search-wrap">
                <Icon d={I.search} size={13} />
                <input
                  className="inv-input"
                  placeholder="Search procedure..."
                  value={procSearch}
                  onChange={handleProcSearch}
                  onFocus={() => procSearch && setProcDropdownVisible(true)}
                  autoFocus
                />
                {procDropdownVisible && filteredProcs.length > 0 && (
                  <ul className="inv-proc-dropdown">
                    {filteredProcs.map(p => (
                      <li key={p.id} onClick={() => handleSelectProc(p)}>
                        <span>{p.name}</span>
                        <span className="inv-proc-price">{fmt(p.price)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <input
              className="inv-input"
              placeholder="Item description..."
              value={itemDesc}
              onChange={e => setItemDesc(e.target.value)}
              autoFocus
            />
          )}

          <div className="inv-add-row inv-add-row-inline">
            <label>Qty</label>
            <input className="inv-input inv-input-sm" type="number" min="1" step="0.01"
              value={itemQty} onChange={e => setItemQty(e.target.value)} />
            <label>Unit Price</label>
            <input className="inv-input inv-input-sm" type="number" min="0" step="0.01"
              placeholder="0.00" value={itemUnitPrice}
              onChange={e => setItemUnitPrice(e.target.value)}
              onFocus={e => e.target.select()} />
            <span className="inv-line-total">
              = {fmt((parseFloat(itemQty) || 0) * (parseFloat(itemUnitPrice) || 0))}
            </span>
          </div>

          <div className="inv-add-row">
            <label className="inv-elig-check">
              <input type="checkbox" checked={itemEligible} onChange={e => setItemEligible(e.target.checked)} />
              <span>Senior/PWD eligible <em>(uncheck for cosmetic / non-medical items)</em></span>
            </label>
          </div>

          <div className="inv-add-row inv-add-actions">
            <button type="button" className="inv-btn-ghost" onClick={() => { resetForm(); setAddMode(null); }}>Cancel</button>
            <button type="button" className="inv-btn-confirm" onClick={handleSubmit} disabled={busy}>
              {busy ? <span className="bills-spinner-small" /> : <><Icon d={I.check} size={12} /> Add Item</>}
            </button>
          </div>
        </div>
      )}

      {/* Items Table */}
      <table className="inv-items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th style={{ textAlign: 'center' }}>Qty</th>
            <th style={{ textAlign: 'right' }}>Unit Price</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th style={{ textAlign: 'center', width: 110 }}>SC/PWD</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={6} className="inv-no-items">No line items yet. Add a procedure or custom item above.</td></tr>
          ) : (
            items.map(item => {
              const eligible = item.sc_pwd_eligible !== false;
              return (
              <tr key={item.id ?? item._tmpId}>
                <td>{item.description}</td>
                <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right' }}>{fmt(item.unit_price)}</td>
                <td style={{ textAlign: 'right' }} className="inv-item-total">{fmt(item.total)}</td>
                <td style={{ textAlign: 'center' }}>
                  {onToggleEligible ? (
                    <button
                      type="button"
                      className={`inv-elig-pill${eligible ? ' is-elig' : ''}`}
                      onClick={() => onToggleEligible(item)}
                      title={eligible ? 'Eligible for SC/PWD discount — click to exclude' : 'Not eligible — click to include'}
                    >
                      {eligible ? 'Eligible' : 'Excluded'}
                    </button>
                  ) : (
                    <span className={`inv-elig-pill${eligible ? ' is-elig' : ''}`}>{eligible ? 'Eligible' : 'Excluded'}</span>
                  )}
                </td>
                <td>
                  <button type="button" className="inv-delete-btn" onClick={() => onDeleteItem(item)}>
                    <Icon d={I.trash} size={13} />
                  </button>
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default InvoiceLineItems;
