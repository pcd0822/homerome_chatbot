import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// 코드블록 문법 하이라이팅 테마 (highlight.js)
import 'highlight.js/styles/github.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
