document.addEventListener("DOMContentLoaded", () => {
    // Auth guard
    if (!isAuthenticated()) {
        window.location.href = "index.html";
        return;
    }

    // Nav Username
    const userNameElement = document.getElementById("nav-user-name");
    if (userNameElement) userNameElement.textContent = localStorage.getItem("user_name") || "Student";

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            clearToken();
            window.location.href = "index.html";
        });
    }

    // DOM Elements
    const titleInput = document.getElementById("title");
    const notesInput = document.getElementById("notes");
    const charCounter = document.getElementById("char-counter");
    const btnGenerate = document.getElementById("btn-generate");
    
    // Panels
    const panelInput = document.getElementById("panel-input");
    const panelLoading = document.getElementById("panel-loading");
    const panelPreview = document.getElementById("panel-preview");
    
    // Loading Text
    const loadingMessage = document.getElementById("loading-message");
    const previewCardsList = document.getElementById("preview-cards-list");
    const previewCountText = document.getElementById("preview-count-text");
    const btnSaveSet = document.getElementById("btn-save-set");
    const btnRegenerate = document.getElementById("btn-regenerate");

    let generatedCards = [];
    let generatedSetId = null;
    let loadingInterval = null;

    // Character Counter
    notesInput.addEventListener("input", () => {
        const count = notesInput.value.length;
        charCounter.textContent = `${count} / 5000 characters`;
        
        if (count >= 5000) {
            charCounter.style.color = "var(--danger)";
        } else if (count >= 4500) {
            charCounter.style.color = "var(--warning)";
        } else {
            charCounter.style.color = "var(--text-muted)";
        }

        // Enable/Disable generate button
        btnGenerate.disabled = count < 50;
    });

    // Loading Screen Message Cycler
    const loadingMessages = [
        "Analyzing study notes...",
        "Identifying core concepts...",
        "Extracting keywords & named entities...",
        "Generating context-aware questions...",
        "Formatting flashcards...",
        "Almost done..."
    ];

    function startLoadingMessageCycle() {
        let index = 0;
        loadingMessage.textContent = loadingMessages[0];
        
        loadingInterval = setInterval(() => {
            index = (index + 1) % loadingMessages.length;
            loadingMessage.style.opacity = 0;
            setTimeout(() => {
                loadingMessage.textContent = loadingMessages[index];
                loadingMessage.style.opacity = 1;
            }, 300);
        }, 2200);
    }

    function stopLoadingMessageCycle() {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
    }

    // Generate Request
    btnGenerate.addEventListener("click", async () => {
        const text = notesInput.value.trim();
        const title = titleInput.value.trim();

        if (text.length < 50) {
            showToast("Notes must be at least 50 characters long.", "warning");
            return;
        }

        // Transition to Loading Phase
        panelInput.style.display = "none";
        panelLoading.style.display = "flex";
        startLoadingMessageCycle();

        try {
            const result = await api.post("/api/flashcards/generate", { text, title });
            
            // Set data
            generatedCards = result.cards;
            generatedSetId = result.set._id;
            
            // Render Phase 2 Preview
            renderPreviewCards();
            
            // Transition to Preview Panel
            panelLoading.style.display = "none";
            panelPreview.style.display = "block";
            
            showToast(`Generated ${generatedCards.length} flashcards successfully!`, "success");
        } catch (error) {
            console.error("Generation error", error);
            showToast(error.message, "error");
            
            // Rollback to input panel
            panelLoading.style.display = "none";
            panelInput.style.display = "block";
        } finally {
            stopLoadingMessageCycle();
        }
    });

    // Render Generated Cards in Preview
    function renderPreviewCards() {
        if (previewCardsList) previewCardsList.innerHTML = "";
        if (previewCountText) previewCountText.textContent = `${generatedCards.length} flashcards generated!`;
        
        generatedCards.forEach((card, index) => {
            const isFillBlank = card.type === "fill_blank";
            const cardEl = document.createElement("div");
            cardEl.className = "glass-card preview-card";
            cardEl.dataset.id = card._id;
            
            cardEl.innerHTML = `
                <div class="preview-card-header">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <span class="preview-card-number">CARD ${index + 1}</span>
                        <span style="
                            font-size: 0.7rem;
                            font-weight: 700;
                            padding: 0.2rem 0.55rem;
                            border-radius: 999px;
                            text-transform: uppercase;
                            letter-spacing: 0.04em;
                            background: ${isFillBlank ? 'rgba(6,182,212,0.15)' : 'rgba(139,92,246,0.15)'};
                            color: ${isFillBlank ? 'var(--accent-cyan)' : 'var(--accent-violet)'};
                            border: 1px solid ${isFillBlank ? 'rgba(6,182,212,0.3)' : 'rgba(139,92,246,0.3)'};
                        ">${isFillBlank ? '✏️ Fill in the Blank' : '❓ Question'}</span>
                    </div>
                    <button class="btn-icon btn-delete-card" title="Delete Card">🗑️</button>
                </div>
                <div class="preview-field">
                    <span class="preview-label">${isFillBlank ? 'Fill in the Blank' : 'Question'}</span>
                    <div class="preview-input" contenteditable="true" data-field="question">${escapeHTML(card.question)}</div>
                </div>
                <div class="preview-field">
                    <span class="preview-label">Answer</span>
                    <div class="preview-input" contenteditable="true" data-field="answer">${escapeHTML(card.answer)}</div>
                </div>
            `;

            // Inline Edit blur listener
            const editableFields = cardEl.querySelectorAll(".preview-input");
            editableFields.forEach(field => {
                field.addEventListener("blur", async (e) => {
                    const fieldName = field.dataset.field;
                    const newText = field.textContent.trim();
                    
                    if (!newText) {
                        showToast(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} cannot be empty.`, "warning");
                        field.textContent = card[fieldName]; // Reset text
                        return;
                    }
                    
                    if (newText !== card[fieldName]) {
                        // Call PUT to save edit in DB
                        try {
                            card[fieldName] = newText;
                            await api.put(`/api/flashcards/cards/${card._id}`, {
                                question: card.question,
                                answer: card.answer
                            });
                            showToast("Card updated.", "success");
                        } catch (err) {
                            showToast("Failed to save changes: " + err.message, "error");
                        }
                    }
                });
            });

            // Delete Card listener
            const deleteCardBtn = cardEl.querySelector(".btn-delete-card");
            deleteCardBtn.addEventListener("click", async () => {
                try {
                    await api.delete(`/api/flashcards/cards/${card._id}`);
                    cardEl.style.animation = "fade-in 0.3s reverse ease-out forwards";
                    cardEl.addEventListener("animationend", () => {
                        generatedCards = generatedCards.filter(c => c._id !== card._id);
                        renderPreviewCards(); // Re-render numbers
                    });
                    showToast("Card deleted.", "success");
                } catch (err) {
                    showToast("Failed to delete card: " + err.message, "error");
                }
            });

            previewCardsList.appendChild(cardEl);
        });
    }

    // Save Set
    btnSaveSet.addEventListener("click", () => {
        showToast("Set saved successfully to your dashboard!", "success");
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 800);
    });

    // Regenerate / Go back to edit text
    btnRegenerate.addEventListener("click", async () => {
        if (confirm("Are you sure you want to go back? This will delete the currently generated set and let you edit your original notes.")) {
            try {
                if (generatedSetId) {
                    await api.delete(`/api/flashcards/sets/${generatedSetId}`);
                }
            } catch (e) {
                console.error("Cleanup set error", e);
            }
            
            // Reset state and transition back
            generatedSetId = null;
            generatedCards = [];
            panelPreview.style.display = "none";
            panelInput.style.display = "block";
        }
    });

    function escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
