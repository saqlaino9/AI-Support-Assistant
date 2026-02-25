import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import ReactMarkdown from 'react-markdown';
import './App.css';

const API_URL = 'http://localhost:5000/api';

function App() {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Initialize Session on Load
  useEffect(() => {
    let currentSession = localStorage.getItem('sessionId');
    if (!currentSession) {
      currentSession = uuidv4();
      localStorage.setItem('sessionId', currentSession);
    }
    setSessionId(currentSession);
    loadConversation(currentSession);
  }, []);

  // Auto-scroll to the newest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch past conversation for this session
  const loadConversation = async (id) => {
    try {
      const { data } = await axios.get(`${API_URL}/conversations/${id}`);
      setMessages(data);
    } catch (err) {
      console.error("Failed to load chat history", err);
    }
  };

  // Generate a new session
  const handleNewChat = () => {
    const newSession = uuidv4();
    localStorage.setItem('sessionId', newSession);
    setSessionId(newSession);
    setMessages([]);
  };

  // Handle sending a message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Optimistically add user message to UI
    const userMessage = { role: 'user', content: input, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data } = await axios.post(`${API_URL}/chat`, {
        sessionId,
        message: input
      });

      // Add AI response to UI
      const aiMessage = { role: 'assistant', content: data.reply, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const errorMsg = { role: 'assistant', content: "⚠️ Error connecting to server. Make sure the backend is running.", created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h2>AI Support Assistant</h2>
        <button className="new-chat-btn" onClick={handleNewChat}>+ New Chat</button>
      </header>

      <div className="messages-list">
        {messages.length === 0 && (
          <div className="empty-state">Start a conversation with the support assistant!</div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={idx} className={`message-wrapper ${msg.role}`}>
            <div className="message-bubble">
              <strong>{msg.role === 'user' ? 'You' : 'AI Assistant'}</strong>
              <div className="markdown-body">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              <span className="timestamp">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message-wrapper assistant">
            <div className="message-bubble typing">AI is typing...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="input-area">
        <input 
          type="text" 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          placeholder="Ask a support question..." 
          disabled={isLoading}
          className="chat-input"
        />
        <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
          Send
        </button>
      </form>
    </div>
  );
}

export default App;