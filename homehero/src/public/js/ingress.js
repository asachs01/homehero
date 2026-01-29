/**
 * Home Assistant Ingress Support
 *
 * With relative paths, we don't need complex ingress path detection.
 * The browser's URL resolution handles both ingress and direct access automatically.
 *
 * Example:
 * - Ingress URL: https://ha:8123/api/hassio_ingress/TOKEN/index.html
 *   - './api/foo' resolves to: https://ha:8123/api/hassio_ingress/TOKEN/api/foo ✓
 * - Direct URL: http://localhost:3000/index.html
 *   - './api/foo' resolves to: http://localhost:3000/api/foo ✓
 */

/**
 * Redirect to a path relative to current location
 * Works correctly in both ingress and direct access modes
 * @param {string} path - The path to redirect to (e.g., 'login.html' or './login.html')
 */
function ingressRedirect(path) {
  // Remove leading slash or ./ if present, then add ./
  const cleanPath = path.replace(/^\.?\//, '');
  window.location.href = './' + cleanPath;
}

/**
 * Synchronous version of ingressRedirect
 * @param {string} path - The path to redirect to
 */
function ingressRedirectSync(path) {
  ingressRedirect(path);
}

/**
 * Get the base URL for API calls (always relative)
 * @returns {string} The base URL for API calls
 */
function getApiBase() {
  return './api';
}

/**
 * Make a fetch call to an API endpoint
 * Handles relative paths automatically for ingress compatibility
 * @param {string} endpoint - The API endpoint (e.g., '/auth/login' or 'auth/login')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
function apiFetch(endpoint, options = {}) {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.replace(/^\//, '');
  return fetch('./api/' + cleanEndpoint, options);
}
