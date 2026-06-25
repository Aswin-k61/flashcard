document.addEventListener("DOMContentLoaded", () => {
    // If user is already logged in, redirect to dashboard
    if (isAuthenticated()) {
        window.location.href = "dashboard.html";
        return;
    }

    const loginTab = document.getElementById("tab-login");
    const signupTab = document.getElementById("tab-signup");
    const nameGroup = document.getElementById("group-name");
    const nameInput = document.getElementById("name");
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const authForm = document.getElementById("auth-form");
    const btnSubmit = document.getElementById("btn-submit");
    const submitText = document.getElementById("submit-text");
    const submitSpinner = document.getElementById("submit-spinner");
    const togglePassword = document.getElementById("toggle-password");
    
    let isLoginMode = true;

    // Switch to Login Mode
    loginTab.addEventListener("click", () => {
        if (isLoginMode) return;
        isLoginMode = true;
        loginTab.classList.add("active");
        signupTab.classList.remove("active");
        nameGroup.style.display = "none";
        nameInput.removeAttribute("required");
        submitText.textContent = "Sign In";
    });

    // Switch to Signup Mode
    signupTab.addEventListener("click", () => {
        if (!isLoginMode) return;
        isLoginMode = false;
        signupTab.classList.add("active");
        loginTab.classList.remove("active");
        nameGroup.style.display = "flex";
        nameInput.setAttribute("required", "true");
        submitText.textContent = "Create Account";
    });

    // Password Show/Hide Toggle
    togglePassword.addEventListener("click", () => {
        const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
        passwordInput.setAttribute("type", type);
        togglePassword.textContent = type === "password" ? "👁️" : "🙈";
    });

    // Form Submission
    authForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const name = nameInput.value.trim();
        
        // Front-end validations
        if (!email || !password) {
            showToast("Please fill in all required fields.", "error");
            return;
        }
        if (password.length < 6) {
            showToast("Password must be at least 6 characters long.", "error");
            return;
        }
        if (!isLoginMode && !name) {
            showToast("Please provide your name.", "error");
            return;
        }

        // Set Loading State
        btnSubmit.disabled = true;
        submitSpinner.style.display = "inline-block";
        submitText.textContent = isLoginMode ? "Signing In..." : "Creating Account...";

        try {
            let data;
            if (isLoginMode) {
                // Login
                data = await api.post("/api/auth/login", { email, password });
                showToast("Logged in successfully!", "success");
            } else {
                // Sign Up
                data = await api.post("/api/auth/signup", { name, email, password });
                showToast("Account created successfully!", "success");
            }
            
            // Store Session Data
            setToken(data.access_token);
            localStorage.setItem("user_name", data.user.name);
            localStorage.setItem("user_email", data.user.email);
            
            // Redirect
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 800);
            
        } catch (error) {
            console.error("Auth error", error);
            showToast(error.message, "error");
            
            // Reset Loading State
            btnSubmit.disabled = false;
            submitSpinner.style.display = "none";
            submitText.textContent = isLoginMode ? "Sign In" : "Create Account";
            
            // Add shake animation to form
            authForm.style.animation = "shake 0.4s ease";
            authForm.addEventListener("animationend", () => {
                authForm.style.animation = "";
            });
        }
    });
});
