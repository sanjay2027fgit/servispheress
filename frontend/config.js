// Backend Configuration
// This file can be overridden per environment
const BACKEND_CONFIG = {
  development: 'http://localhost:5000',
  production: 'https://servisphere-api.onrender.com', // Update this with your actual Render URL
  staging: 'https://staging-api.servisphere.onrender.com'
};

// Get environment based on domain
function getBackendUrl() {
  const hostname = window.location.hostname;
  
  // Local development
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return BACKEND_CONFIG.development;
  }
  
  // Netlify staging/preview deployments
  if (hostname.includes('netlify.app') && hostname.includes('--')) {
    return BACKEND_CONFIG.staging;
  }
  
  // Production Netlify
  if (hostname === 'servispheress.netlify.app') {
    return BACKEND_CONFIG.production;
  }
  
  // File protocol (local testing)
  if (window.location.protocol === 'file:') {
    return BACKEND_CONFIG.development;
  }
  
  // Fallback
  return window.location.origin;
}

const API_BASE_URL = getBackendUrl();
