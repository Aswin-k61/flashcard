document.addEventListener("DOMContentLoaded", () => {
    // Auth Check
    if (!isAuthenticated()) {
        window.location.href = "index.html";
        return;
    }

    // Set User Profile Display
    const userNameElement = document.getElementById("nav-user-name");
    const welcomeNameElement = document.getElementById("welcome-name");
    const savedName = localStorage.getItem("user_name") || "Student";
    
    if (userNameElement) userNameElement.textContent = savedName;
    if (welcomeNameElement) welcomeNameElement.textContent = savedName;

    // Logout Action
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            clearToken();
            showToast("Logged out successfully.", "info");
            setTimeout(() => {
                window.location.href = "index.html";
            }, 500);
        });
    }

    const setGrid = document.getElementById("set-grid");
    const emptyState = document.getElementById("empty-state");
    const totalSetsBadge = document.getElementById("total-sets-badge");
    const totalCardsBadge = document.getElementById("total-cards-badge");
    
    // Modal Delete Elements
    const deleteModal = document.getElementById("delete-modal");
    const btnCancelDelete = document.getElementById("btn-cancel-delete");
    const btnConfirmDelete = document.getElementById("btn-confirm-delete");
    
    let setIdToDelete = null;
    let cardElementToDelete = null;

    // Relative Date Formatter
    function formatRelativeDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHrs < 24) return `${diffHrs}h ago`;
        if (diffDays === 1) return "Yesterday";
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Load Sets from Backend
    async function loadFlashcardSets() {
        try {
            const sets = await api.get("/api/flashcards/sets");
            
            // Render Counts
            let totalCardsCount = 0;
            if (totalSetsBadge) totalSetsBadge.textContent = `${sets.length} sets`;
            
            if (sets.length === 0) {
                if (setGrid) setGrid.style.display = "none";
                if (emptyState) emptyState.style.display = "flex";
                if (totalCardsBadge) totalCardsBadge.textContent = "0 cards";
                return;
            }

            if (setGrid) setGrid.style.display = "grid";
            if (emptyState) emptyState.style.display = "none";
            if (setGrid) setGrid.innerHTML = "";

            sets.forEach((set, index) => {
                totalCardsCount += set.card_count;
                
                // Calculate percentage known
                const totalReviewed = set.stats.known + set.stats.not_known;
                const pctKnown = set.card_count > 0 ? Math.round((set.stats.known / set.card_count) * 100) : 0;
                
                // SVG circular progress path calculation
                const radius = 15;
                const circumference = 2 * Math.PI * radius;
                const strokeDashoffset = circumference - (pctKnown / 100) * circumference;

                const card = document.createElement("div");
                card.className = "glass-card set-card animate-slide-up";
                card.style.animationDelay = `${index * 80}ms`;
                card.dataset.id = set._id;
                
                card.innerHTML = `
                    <div class="set-info">
                        <h3>${escapeHTML(set.title)}</h3>
                        <div class="set-meta">
                            <span>📂 ${set.card_count} cards</span>
                            <span>⏱️ ${formatRelativeDate(set.created_at)}</span>
                        </div>
                    </div>
                    <div class="set-footer">
                        <div class="set-stats-summary" title="${pctKnown}% known (${set.stats.known}/${set.card_count})">
                            <div class="set-progress-ring">
                                <svg width="38" height="38">
                                    <circle class="stats-circle-bg" cx="19" cy="19" r="${radius}"></circle>
                                    <circle class="stats-circle-val" cx="19" cy="19" r="${radius}" 
                                        stroke-dasharray="${circumference}" 
                                        stroke-dashoffset="${strokeDashoffset}"
                                        style="stroke: ${pctKnown > 50 ? 'var(--success)' : pctKnown > 20 ? 'var(--warning)' : 'var(--accent-violet)'}"></circle>
                                </svg>
                            </div>
                            <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary);">${pctKnown}% known</span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; align-items: center;">
                            <button class="btn-icon btn-delete" title="Delete Flashcard Set">🗑️</button>
                            <a href="review.html?set_id=${set._id}" class="btn btn-primary" style="padding: 0.5rem 1rem; font-size: 0.85rem;">Review</a>
                        </div>
                    </div>
                `;

                // Add delete listener
                const deleteBtn = card.querySelector(".btn-delete");
                deleteBtn.addEventListener("click", () => {
                    setIdToDelete = set._id;
                    cardElementToDelete = card;
                    openDeleteModal();
                });

                setGrid.appendChild(card);
            });

            if (totalCardsBadge) totalCardsBadge.textContent = `${totalCardsCount} cards`;
            
        } catch (error) {
            console.error("Failed to load sets", error);
            showToast("Failed to load your flashcard sets.", "error");
        }
    }

    // Modal Operations
    function openDeleteModal() {
        if (deleteModal) deleteModal.classList.add("active");
    }

    function closeDeleteModal() {
        if (deleteModal) deleteModal.classList.remove("active");
        setIdToDelete = null;
        cardElementToDelete = null;
    }

    if (btnCancelDelete) {
        btnCancelDelete.addEventListener("click", closeDeleteModal);
    }

    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener("click", async () => {
            if (!setIdToDelete) return;
            
            try {
                // Set loading button
                btnConfirmDelete.disabled = true;
                btnConfirmDelete.textContent = "Deleting...";
                
                await api.delete(`/api/flashcards/sets/${setIdToDelete}`);
                showToast("Flashcard set deleted successfully.", "success");
                
                // Animate out card element
                if (cardElementToDelete) {
                    cardElementToDelete.style.animation = "fade-in 0.3s reverse ease-out forwards";
                    cardElementToDelete.addEventListener("animationend", () => {
                        loadFlashcardSets(); // Reload lists
                    });
                } else {
                    loadFlashcardSets();
                }
            } catch (error) {
                console.error("Failed to delete set", error);
                showToast(error.message, "error");
            } finally {
                btnConfirmDelete.disabled = false;
                btnConfirmDelete.textContent = "Delete";
                closeDeleteModal();
            }
        });
    }

    // Helper to prevent HTML injection
    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Init
    loadFlashcardSets();
});
