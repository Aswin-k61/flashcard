document.addEventListener("DOMContentLoaded", () => {
    // Auth Guard
    if (!isAuthenticated()) {
        window.location.href = "index.html";
        return;
    }

    // Nav Profile name
    const userNameElement = document.getElementById("nav-user-name");
    if (userNameElement) userNameElement.textContent = localStorage.getItem("user_name") || "Student";

    // URL Parameters
    const urlParams = new URLSearchParams(window.location.search);
    const setId = urlParams.get("set_id");
    
    if (!setId) {
        showToast("No flashcard set specified.", "error");
        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1000);
        return;
    }

    // DOM Elements
    const setTitleElement = document.getElementById("set-title");
    const cardProgressText = document.getElementById("card-progress-text");
    const progressFill = document.getElementById("progress-fill");
    
    // Card Elements
    const flashcardScene = document.getElementById("flashcard-scene");
    const cardQuestion = document.getElementById("card-question");
    const cardAnswer = document.getElementById("card-answer");
    
    // Actions Panel
    const reviewActions = document.getElementById("review-actions");
    const btnNotKnown = document.getElementById("btn-not-known");
    const btnKnown = document.getElementById("btn-known");
    
    // Session Counter Stats
    const sessionKnownCount = document.getElementById("session-known-count");
    const sessionNotKnownCount = document.getElementById("session-not-known-count");

    // Complete Panel Elements
    const reviewSessionPanel = document.getElementById("review-session-panel");
    const panelComplete = document.getElementById("panel-complete");
    const statsPercentageVal = document.getElementById("stats-percentage-val");
    const statsKnownCount = document.getElementById("stats-known-count");
    const statsNotKnownCount = document.getElementById("stats-not-known-count");
    const statsTotalCount = document.getElementById("stats-total-count");
    
    const btnReviewAgain = document.getElementById("btn-review-again");
    const btnBackDashboard = document.getElementById("btn-back-dashboard");

    // State Variables
    let sessionState = {
        totalCards: 0,
        cardsReviewed: 0,
        knownCount: 0,
        notKnownCount: 0,
        currentCard: null,
        isFlipped: false
    };

    // Load Set Info
    async function loadSetInfo() {
        try {
            const data = await api.get(`/api/flashcards/sets/${setId}`);
            if (setTitleElement) setTitleElement.textContent = data.set.title;
            sessionState.totalCards = data.set.card_count;
            updateProgressBar();
        } catch (error) {
            console.error("Failed to load set info", error);
            showToast("Failed to retrieve flashcard set details.", "error");
        }
    }

    // Load next card to review (weighted random choice from API)
    async function loadNextCard() {
        try {
            // Reset flip classes and state
            flashcardScene.classList.remove("is-flipped");
            sessionState.isFlipped = false;
            reviewActions.classList.remove("active");
            
            // Set slight entry animation
            flashcardScene.style.animation = "none";
            // trigger reflow
            void flashcardScene.offsetWidth;
            flashcardScene.style.animation = "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards";

            const data = await api.get(`/api/review/${setId}/next`);
            
            if (!data.card) {
                // No cards, or session completed (all cards reviewed/none left)
                showSessionComplete();
                return;
            }

            sessionState.currentCard = data.card;
            
            const isFillBlank = data.card.type === "fill_blank";

            // Update front face label and hint
            const frontTag = document.querySelector(".flashcard-front .flashcard-tag");
            const frontHint = document.querySelector(".flashcard-front .flashcard-hint");
            if (frontTag) {
                frontTag.textContent = isFillBlank ? "Fill in the Blank" : "Question";
                frontTag.style.color = isFillBlank ? "var(--accent-cyan)" : "";
            }
            if (frontHint) {
                frontHint.textContent = isFillBlank
                    ? "What goes in the blank? Click to reveal answer."
                    : "Click card to reveal answer (or press Space)";
            }

            // Render text
            if (cardQuestion) cardQuestion.textContent = data.card.question;
            if (cardAnswer) cardAnswer.textContent = data.card.answer;
            
            updateProgressBar();
            
        } catch (error) {
            console.error("Error loading next card", error);
            showToast("Error loading the next flashcard.", "error");
        }
    }

    // Flip Card Action
    function flipCard() {
        if (sessionState.isFlipped) return;
        sessionState.isFlipped = true;
        flashcardScene.classList.add("is-flipped");
        
        // Show known / not known action buttons
        reviewActions.classList.add("active");
    }

    // User Feedback click handlers
    async function handleCardFeedback(status) {
        if (!sessionState.currentCard) return;
        
        const cardId = sessionState.currentCard._id;
        
        try {
            // 1. Submit feedback to backend
            await api.patch(`/api/review/${cardId}`, { status });
            
            // 2. Update local state
            sessionState.cardsReviewed++;
            if (status === "known") {
                sessionState.knownCount++;
                if (sessionKnownCount) sessionKnownCount.textContent = sessionState.knownCount;
            } else {
                sessionState.notKnownCount++;
                if (sessionNotKnownCount) sessionNotKnownCount.textContent = sessionState.notKnownCount;
            }
            
            // 3. Animate card sliding out
            flashcardScene.style.animation = "fade-in 0.25s reverse ease-out forwards";
            flashcardScene.addEventListener("animationend", onCardExitEnd, { once: true });
            
        } catch (error) {
            console.error("Failed to submit feedback", error);
            showToast("Failed to save response. Please try again.", "error");
        }
    }

    function onCardExitEnd() {
        loadNextCard();
    }

    // Progress bar update
    function updateProgressBar() {
        if (sessionState.totalCards === 0) return;
        
        // Calculate progress percentage
        // In this implementation, a session can be infinite/continuous, but we cap it at total set count
        const percent = Math.min(100, Math.round((sessionState.cardsReviewed / sessionState.totalCards) * 100));
        
        if (progressFill) progressFill.style.width = `${percent}%`;
        if (cardProgressText) {
            cardProgressText.textContent = `Card ${Math.min(sessionState.totalCards, sessionState.cardsReviewed + 1)} of ${sessionState.totalCards}`;
        }
    }

    // Show Session Complete Panel
    function showSessionComplete() {
        if (reviewSessionPanel) reviewSessionPanel.style.display = "none";
        if (panelComplete) panelComplete.style.display = "block";
        
        // Fill stats numbers
        if (statsKnownCount) statsKnownCount.textContent = sessionState.knownCount;
        if (statsNotKnownCount) statsNotKnownCount.textContent = sessionState.notKnownCount;
        if (statsTotalCount) statsTotalCount.textContent = sessionState.cardsReviewed;
        
        // Calculate accuracy
        const total = sessionState.cardsReviewed;
        const known = sessionState.knownCount;
        const accuracyPct = total > 0 ? Math.round((known / total) * 100) : 0;
        
        // Draw circular progress percentage
        const radius = 70;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (accuracyPct / 100) * circumference;
        
        const circleVal = document.querySelector(".stats-circle-val");
        if (circleVal) {
            circleVal.setAttribute("stroke-dasharray", circumference);
            // Animate stroke dashoffset
            circleVal.style.strokeDashoffset = circumference;
            // Force redraw
            void circleVal.offsetWidth;
            circleVal.style.strokeDashoffset = strokeDashoffset;
        }
        
        if (statsPercentageVal) statsPercentageVal.textContent = `${accuracyPct}%`;
    }

    // Reset Review Session
    function resetSession() {
        sessionState = {
            totalCards: sessionState.totalCards,
            cardsReviewed: 0,
            knownCount: 0,
            notKnownCount: 0,
            currentCard: null,
            isFlipped: false
        };

        if (sessionKnownCount) sessionKnownCount.textContent = "0";
        if (sessionNotKnownCount) sessionNotKnownCount.textContent = "0";
        
        if (panelComplete) panelComplete.style.display = "none";
        if (reviewSessionPanel) reviewSessionPanel.style.display = "block";
        
        loadNextCard();
    }

    // Event Listeners
    if (flashcardScene) {
        flashcardScene.addEventListener("click", () => {
            if (!sessionState.isFlipped) {
                flipCard();
            }
        });
    }
    /* ==========================
    HOLOGRAPHIC CARD TILT
    ========================== */

    flashcardScene.addEventListener("mousemove", (e) => {

        const rect = flashcardScene.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rotateY = ((x / rect.width) - 0.5) * 16;
        const rotateX = ((y / rect.height) - 0.5) * -16;

        if (!sessionState.isFlipped) {
            flashcardScene.style.transform =
                `perspective(1200px)
                rotateX(${rotateX}deg)
                rotateY(${rotateY}deg)`;
        }
    });

    flashcardScene.addEventListener("mouseleave", () => {

        if (!sessionState.isFlipped) {
            flashcardScene.style.transform =
                "perspective(1200px) rotateX(0deg) rotateY(0deg)";
        }
    });

    if (btnKnown) {
        btnKnown.addEventListener("click", (e) => {
            e.stopPropagation();
            handleCardFeedback("known");
        });
    }

    if (btnNotKnown) {
        btnNotKnown.addEventListener("click", (e) => {
            e.stopPropagation();
            handleCardFeedback("not_known");
        });
    }

    if (btnReviewAgain) {
        btnReviewAgain.addEventListener("click", resetSession);
    }
    
    if (btnBackDashboard) {
        btnBackDashboard.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        // Only active if review panel is visible
        if (reviewSessionPanel && reviewSessionPanel.style.display !== "none") {
            if (e.code === "Space") {
                e.preventDefault();
                if (!sessionState.isFlipped) {
                    flipCard();
                }
            } else if (sessionState.isFlipped) {
                if (e.key === "ArrowLeft" || e.key.toLowerCase() === "n") {
                    handleCardFeedback("not_known");
                } else if (e.key === "ArrowRight" || e.key.toLowerCase() === "k") {
                    handleCardFeedback("known");
                }
            }
        }
    });

    // Logout
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            clearToken();
            window.location.href = "index.html";
        });
    }

    // Init
    loadSetInfo().then(loadNextCard);
});
