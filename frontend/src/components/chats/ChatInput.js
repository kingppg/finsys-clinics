import React, { useState } from 'react';

export default function ChatInput({ onSend }) {
  const [value, setValue] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex',
      borderTop: '1px solid #e0e6ed',
      padding: '12px 12px',
      background: '#f6f9fc'
    }}>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type your message…"
        style={{
          flex: 1,
          padding: '10px 14px',
          borderRadius: 8,
          border: '1px solid #d0d7de',
          fontSize: 16,
          background: '#fff'
        }}
      />
      <button type="submit" style={{
        marginLeft: 8,
        padding: '0 18px',
        borderRadius: 8,
        background: 'linear-gradient(90deg,#3462db 60%,#4ac7fa 100%)',
        color: 'white',
        fontWeight: 600,
        fontSize: 15,
        border: 'none',
        cursor: 'pointer'
      }}>Send</button>
    </form>
  );
}