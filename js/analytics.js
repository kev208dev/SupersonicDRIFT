const GA_MEASUREMENT_ID = '';
const CLARITY_ID = '';

export function initAnalytics() {
  // Google Analytics insertion point:
  // const GA_MEASUREMENT_ID = "G-XXXXXXXXXX";
  // Load gtag.js here when a real measurement ID is available.

  // Microsoft Clarity insertion point:
  // const CLARITY_ID = "XXXXXXXXXX";
  // Load clarity.js here when a real project ID is available.

  if (GA_MEASUREMENT_ID) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID);
  }

  if (CLARITY_ID) {
    // Load Microsoft Clarity here when CLARITY_ID is configured.
  }
}

export function trackEvent(eventName, params = {}) {
  if (!eventName) return;
  if (!GA_MEASUREMENT_ID && !CLARITY_ID) return;
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
  if (typeof window.clarity === 'function' && CLARITY_ID) {
    window.clarity('event', eventName);
  }
}
