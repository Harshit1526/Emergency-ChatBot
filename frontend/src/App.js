import React, { useState } from 'react';
import ChatbotUI from './components/ChatbotUI'; // Import Chatbot component
import './ChatApp.css'; // Styles for login/signup and chat

const ChatApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Tracks authentication status
  const [isSignup, setIsSignup] = useState(false); // Tracks if the user is signing up

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleAuth = () => {
    if (email.trim() && password.trim()) {
      // Mock authentication (Replace with backend API integration)
      setIsAuthenticated(true);
    } else {
      alert('Please enter valid email and password.');
    }
  };

  return (
    <div className="app-container">
      {isAuthenticated ? (
        <ChatbotUI /> // Show Chatbot when authenticated
      ) : (
        <div className="auth-container">
          <h2>{isSignup ? 'Sign Up' : 'Login'}</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={handleAuth}>{isSignup ? 'Sign Up' : 'Login'}</button>
          <p>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <span onClick={() => setIsSignup(!isSignup)}>
              {isSignup ? 'Login' : 'Sign Up'}
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

export default ChatApp;
