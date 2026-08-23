import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './lib/auth'

// HashRouter (not BrowserRouter) is used intentionally: this app is built to
// be deployed both on GitHub Pages (served from a repo sub-path, e.g.
// /miliconfig-pro/) and on Cloudflare Workers Static Assets. Neither host is
// guaranteed to rewrite unknown deep-link paths back to index.html, which
// causes a hard 404 on refresh/direct-link with a path-based router. Hash
// routing (/#/tokens instead of /tokens) never touches the actual request
// path, so it works identically — with zero server-side rewrite rules — on
// GitHub Pages, Cloudflare Workers, Cloudflare Pages, or any plain static
// host. Auth in this app is email/password only (no OAuth/magic-link hash
// callback), so there's no conflict with Supabase writing tokens into the
// URL hash.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
)
