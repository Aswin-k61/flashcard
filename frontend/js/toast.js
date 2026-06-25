// Toast Notification System

class ToastSystem {
    constructor() {
        // Create container if it doesn't exist
        this.container = document.querySelector(".toast-container");
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.className = "toast-container";
            document.body.appendChild(this.container);
        }
    }

    show(message, type = "info") {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        
        let icon = "ℹ️";
        if (type === "success") icon = "✅";
        if (type === "error") icon = "❌";
        if (type === "warning") icon = "⚠️";
        
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icon}</span>
                <span class="toast-msg">${message}</span>
            </div>
            <div class="toast-close">&times;</div>
        `;
        
        // Append toast to container
        this.container.appendChild(toast);
        
        // Setup close action
        const closeBtn = toast.querySelector(".toast-close");
        closeBtn.onclick = () => this.dismiss(toast);
        
        // Auto dismiss after 4.5s
        setTimeout(() => {
            if (toast.parentNode) {
                this.dismiss(toast);
            }
        }, 4500);
    }
    
    dismiss(toast) {
        toast.style.animation = "fade-in 0.3s reverse ease-out forwards";
        toast.addEventListener("animationend", () => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        });
    }
}

// Global instance
const showToast = (message, type) => {
    const system = new ToastSystem();
    system.show(message, type);
};
