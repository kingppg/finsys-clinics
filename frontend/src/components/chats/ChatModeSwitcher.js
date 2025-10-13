import React from 'react';

export default function ChatModeSwitcher({ chatMode, onRequestHuman, onReturnToBot }) {
  return (
    <div style={{
      width: '100%',
      marginBottom: 16,
      padding: '12px 0',
      textAlign: 'center',
      background: chatMode === "human" ? '#f0f7ff' : '#f6f9fc',
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(52,98,219,0.08)',
      fontSize: 16,
      fontWeight: 500,
      color: '#3462db'
    }}>
      {chatMode === "human" ? (
        <>
          <span>
            You are chatting with a <b>human agent</b>.
          </span>
          <br />
          <button
            style={{
              marginTop: 8,
              padding: '8px 18px',
              background: 'linear-gradient(90deg,#4ac7fa 60%,#3462db 100%)',
              color: 'white',
              fontWeight: 600,
              fontSize: 15,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(52,98,219,0.08)'
            }}
            onClick={onReturnToBot}
          >
            Back to Bot
          </button>
        </>
      ) : (
        <>
          <span>
            You are chatting with our <b>virtual assistant</b>.
          </span>
          <br />
          <button
            style={{
              marginTop: 8,
              padding: '8px 18px',
              background: 'linear-gradient(90deg,#3462db 60%,#4ac7fa 100%)',
              color: 'white',
              fontWeight: 600,
              fontSize: 15,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(52,98,219,0.08)'
            }}
            onClick={onRequestHuman}
          >
            Talk to Human
          </button>
        </>
      )}
    </div>
  );
}