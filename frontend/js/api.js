const API_BASE = window.location.origin; // Since served by FastAPI, base is same as origin

// LocalStorage helpers
function getToken() {
    return localStorage.getItem("access_token");
}

function setToken(token) {
    localStorage.setItem("access_token", token);
}

function clearToken() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_email");
}

function isAuthenticated() {
    return getToken() !== null;
}

// Decode base64 JWT payload safely
function getUserFromToken() {
    const token = getToken();
    if (!token) return null;
    
    try {
        const payloadBase64 = token.split('.')[1];
        const decodedJson = atob(payloadBase64);
        const decoded = JSON.parse(decodedJson);
        return decoded;
    } catch (e) {
        console.error("Failed to decode token", e);
        return null;
    }
}

// Core fetch wrapper
async function fetchWithAuth(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${API_BASE}${endpoint}`;
    
    // Set headers
    const token = getToken();
    const headers = {
        ...options.headers,
    };
    
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }
    
    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }
    
    const fetchOptions = {
        ...options,
        headers
    };
    
    try {
        const response = await fetch(url, fetchOptions);
        
        // Handle unauthorized session expiration
        if (response.status === 401) {
            clearToken();
            // Redirect to login if not already there
            if (!window.location.pathname.endsWith("index.html") && window.location.pathname !== "/") {
                window.location.href = "index.html";
            }
            throw new Error("Session expired. Please log in again.");
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            // Backend sends error detail in JSON
            const errorMsg = data.detail || "An unexpected error occurred.";
            throw new Error(errorMsg);
        }
        
        return data;
    } catch (error) {
        console.error("API Call Failed:", error);
        throw error;
    }
}

// REST shorthand utilities
const api = {
    get: (endpoint) => fetchWithAuth(endpoint, { method: "GET" }),
    post: (endpoint, body) => fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify(body)
    }),
    put: (endpoint, body) => fetchWithAuth(endpoint, {
        method: "PUT",
        body: JSON.stringify(body)
    }),
    patch: (endpoint, body) => fetchWithAuth(endpoint, {
        method: "PATCH",
        body: JSON.stringify(body)
    }),
    delete: (endpoint) => fetchWithAuth(endpoint, { method: "DELETE" })
};

