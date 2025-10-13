import React, { useState } from 'react';
import ChatModeSwitcher from './ChatModeSwitcher';
import ChatMessageList from './ChatMessageList';
import ChatInput from './ChatInput';

export default function ChatBox({ user }) {
  const [chatMode, setChatMode] = useState('bot'); // "bot" or "human"
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Welcome! How can I help you today?' }
  ]);

  function sendMessage(text) {
    setMessages(msgs => [...msgs, { sender: user?.name || 'You', text }]);
    if (chatMode === 'bot') {
      setTimeout(() => {
        setMessages(msgs => [...msgs, { sender: 'bot', text: 'Bot reply: ' + text }]);
      }, 800);
    } else {
      setTimeout(() => {
        setMessages(msgs => [...msgs, { sender: 'human', text: 'Human agent reply: ' + text }]);
      }, 1200);
    }
  }

  function handleRequestHuman() {
    setChatMode('human');
    setMessages(msgs => [...msgs, { sender: 'system', text: 'You are now chatting with a human agent.' }]);
  }

  function handleReturnToBot() {
    setChatMode('bot');
    setMessages(msgs => [...msgs, { sender: 'system', text: 'You are now chatting with our virtual assistant.' }]);
  }

  return (
    <div style={{
      maxWidth: 400,
      margin: '0 auto',
      border: '1px solid #d0d7de',
      borderRadius: 12,
      background: '#fff',
      boxShadow: '0 2px 16px rgba(52,98,219,0.08)',
      padding: 0,
      overflow: 'hidden',
      minHeight: 480,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <ChatModeSwitcher
        chatMode={chatMode}
        onRequestHuman={handleRequestHuman}
        onReturnToBot={handleReturnToBot}
      />
      <div style={{ flex: 1, padding: "0 18px", overflowY: 'auto' }}>
        <ChatMessageList messages={messages} user={user} />
      </div>
      <ChatInput onSend={sendMessage} />
    </div>
  );
}