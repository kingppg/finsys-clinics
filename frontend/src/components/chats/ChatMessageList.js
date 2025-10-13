import React from 'react';

export default function ChatMessageList({ messages, user }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {messages.map((msg, idx) => (
        <div
          key={idx}
          style={{
            margin: '8px 0',
            textAlign: msg.sender === (user?.name || 'You') ? 'right' : 'left'
          }}
        >
          <span style={{
            display: 'inline-block',
            padding: '8px 14px',
            borderRadius: 16,
            background: msg.sender === 'bot' ? '#f0f7ff'
              : msg.sender === 'human' ? '#fff8e1'
              : msg.sender === 'system' ? '#e8eaf6'
              : '#e3fcec',
            color: '#3462db',
            fontWeight: 500,
            minWidth: 48,
            maxWidth: 220,
            wordBreak: 'break-word'
          }}>
            {msg.text}
          </span>
        </div>
      ))}
    </div>
  );
}