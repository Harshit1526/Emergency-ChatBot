import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './ChatbotUI.css'; // Custom CSS for styling

const ChatbotUI = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatWindowRef = useRef(null);

  // Add auto-scroll effect
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        await sendAudio(audioBlob, audioUrl);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    for (const file of files) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        setMessages(prev => [...prev, 
          { sender: 'bot', text: `⚠️ File "${file.name}" is not an image. Please upload only image files (jpg, png, etc).` }
        ]);
        continue;
      }

      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setMessages(prev => [...prev, 
          { sender: 'bot', text: `⚠️ Image "${file.name}" is too large. Maximum size is 5MB.` }
        ]);
        continue;
      }

      // Create image preview URL
      const imageUrl = URL.createObjectURL(file);
      setMessages(prev => [...prev,
        { 
          sender: 'user',
          type: 'image',
          imageUrl: imageUrl,
          text: `Analyzing image: ${file.name}...`
        }
      ]);

      try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await axios.post('http://localhost:5000/api/chat/analyze-image', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        setMessages(prev => {
          const newMessages = [...prev];
          // Update the last message to include analysis
          if (newMessages.length > 0) {
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage.type === 'image') {
              lastMessage.text = file.name;
            }
          }

          // Format the medical analysis message
          let analysisMessage = `**Emergency Medical Analysis**\n\n`;
          
          // Add injury type and severity
          analysisMessage += `**Injury Assessment:**\n`;
          analysisMessage += `- Type: ${response.data.injuryType}\n`;
          analysisMessage += `- Severity: ${response.data.severity}\n`;
          if (response.data.confidence) {
            analysisMessage += `- Confidence: ${(response.data.confidence * 100).toFixed(1)}%\n\n`;
          }

          // Add Gemini's analysis
          if (response.data.geminiAnalysis) {
            analysisMessage += `**Detailed Analysis:**\n${response.data.geminiAnalysis}\n\n`;
          }

          // Add detected features
          if (response.data.analysis) {
            analysisMessage += `**Technical Analysis:**\n${response.data.analysis}\n\n`;
          }

          // Add recommendations with clear formatting
          if (response.data.recommendations) {
            analysisMessage += `**First Aid Instructions:**\n${response.data.recommendations}`;
          }

          // Add the analysis message
          newMessages.push({
            sender: 'bot',
            text: analysisMessage,
            type: 'analysis',
            emergency: response.data.severity === 'HIGH',
            injuryType: response.data.injuryType
          });

          return newMessages;
        });
      } catch (error) {
        console.error('Error analyzing image:', error);
        let errorMessage = `⚠️ Error analyzing image "${file.name}". Please try again.`;
        
        if (error.response) {
          switch (error.response.status) {
            case 400:
              errorMessage = `⚠️ ${error.response.data.error}`;
              break;
            case 401:
              errorMessage = '⚠️ Authentication error. Please check the API configuration.';
              break;
            case 404:
              errorMessage = '⚠️ Service not available. Please try again later.';
              break;
            case 429:
              errorMessage = '⚠️ Rate limit exceeded. Please try again later.';
              break;
            default:
              errorMessage = `⚠️ ${error.response.data.error || 'Error analyzing image. Please try again.'}`;
          }
        }
        
        setMessages(prev => [...prev, 
          { sender: 'bot', text: errorMessage }
        ]);
      }
    }

    // Reset the file input
    event.target.value = '';
  };

  const sendAudio = async (audioBlob, audioUrl) => {
    const formData = new FormData();
    formData.append('audio', audioBlob);

    // Add audio message with playback controls
    setMessages(prev => [...prev, {
      sender: 'user',
      type: 'audio',
      audioUrl: audioUrl,
      text: 'Audio recorded, analyzing...'
    }]);

    try {
      const response = await axios.post('http://localhost:5000/api/chat/analyze-audio', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setMessages(prev => {
        const newMessages = [...prev];
        // Update the last message to show it's been analyzed
        if (newMessages.length > 0) {
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.type === 'audio') {
            lastMessage.text = 'Audio recording';
          }
        }
        // Add bot's analysis
        newMessages.push({
          sender: 'bot',
          text: `**Audio Analysis:**\n${response.data.analysis}\n\n**Emergency Type:** ${response.data.emergencyType || 'Not identified'}\n**Severity:** ${response.data.severity || 'Not determined'}`
        });
        return newMessages;
      });
    } catch (error) {
      console.error('Error analyzing audio:', error);
      setMessages(prev => {
        const newMessages = [...prev];
        // Update the last message status
        if (newMessages.length > 0) {
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.type === 'audio') {
            lastMessage.text = 'Audio recording (analysis failed)';
          }
        }
        // Add error message
        newMessages.push({
          sender: 'bot',
          text: '⚠️ Error analyzing audio. Please try again.'
        });
        return newMessages;
      });
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { sender: 'user', text: input }];
    setMessages(newMessages);
    setInput('');

    try {
      const response = await axios.post('http://localhost:5000/api/chat', {
        message: input,
      });

      const formattedResponse = response.data.reply
        ? `**Bot:**\n${response.data.reply}`
        : 'Sorry, I could not generate a response.';

      setMessages([...newMessages, { sender: 'bot', text: formattedResponse }]);
    } catch (error) {
      console.error('Error communicating with the backend:', error);
      setMessages([...newMessages, { sender: 'bot', text: '⚠️ Sorry, something went wrong.' }]);
    }
  };

  const renderMessage = (msg, index) => {
    const messageClass = `chat-message ${msg.sender === 'user' ? 'user-message' : 'bot-message'}
      ${msg.emergency ? ' medical-emergency' : ''}
      ${msg.type === 'analysis' ? ' analysis-message' : ''}
      ${msg.injuryType ? ` injury-${msg.injuryType.toLowerCase().replace('/', '-')}` : ''}`;

    return (
      <div key={index} className={messageClass}>
        {msg.type === 'image' && (
          <div className="image-preview">
            <img src={msg.imageUrl} alt="Uploaded" />
            <div className="image-caption">{msg.text}</div>
          </div>
        )}
        {msg.type === 'audio' && (
          <div className="audio-player">
            <audio controls src={msg.audioUrl} />
            <div className="audio-caption">{msg.text}</div>
          </div>
        )}
        <ReactMarkdown>{msg.text}</ReactMarkdown>
      </div>
    );
  };

  return (
    <div className="chat-container">
      <h1 className="chat-header">Emergency Chatbot</h1>
      <div className="chat-window" ref={chatWindowRef}>
        {messages.map((msg, index) => renderMessage(msg, index))}
        {isLoading && (
          <div className="chat-message bot-message loading">
            Analyzing...
          </div>
        )}
      </div>
      <div className="chat-controls">
        <div className="input-container">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
        <div className="media-controls">
          <label className="media-button">
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            📷 Upload Images
          </label>
          <button 
            className={`media-button ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? '⏹️ Stop Recording' : '🎤 Record Audio'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatbotUI;
