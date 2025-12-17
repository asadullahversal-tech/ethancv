/**
 * Centralized API configuration
 * Automatically detects production vs development based on hostname
 */

const getApiBase = (): string => {
  // Check if we're running on localhost (development)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname
    const isLocalhost = hostname === 'localhost' || 
                       hostname === '127.0.0.1' ||
                       hostname === '' ||
                       hostname.startsWith('192.168.') ||
                       hostname.startsWith('10.')
    
    // If not localhost, we're in production - use the Vercel backend
    if (!isLocalhost) {
      return 'https://ethan-ebackend.vercel.app'
    }
  }
  
  // Development: use localhost backend
  return 'http://127.0.0.1:8080'
}

export const API_BASE = getApiBase()

