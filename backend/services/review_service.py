import random
from typing import List, Optional, Dict, Any
from datetime import datetime
from bson import ObjectId
from backend.database import get_database

async def update_card_review(card_id: str, status: str) -> Dict[str, Any]:
    """
    Updates the flashcard's review statistics and weight based on the user's feedback.
    Known: Halve weight (min 0.1) -> appears less frequently
    Not Known: Double weight (max 5.0) -> appears more frequently
    """
    db = get_database()
    
    # 1. Fetch current card
    card = await db.flashcards.find_one({"_id": ObjectId(card_id)})
    if not card:
        raise ValueError("Flashcard not found")
        
    current_weight = card.get("weight", 1.0)
    review_count = card.get("review_count", 0) + 1
    correct_count = card.get("correct_count", 0)
    
    if status == "known":
        new_weight = max(0.1, current_weight * 0.5)
        correct_count += 1
    elif status == "not_known":
        new_weight = min(5.0, current_weight * 2.0)
    else:
        raise ValueError("Invalid status. Must be 'known' or 'not_known'")
        
    # 2. Update card in DB
    update_data = {
        "status": status,
        "weight": new_weight,
        "review_count": review_count,
        "correct_count": correct_count,
        "last_reviewed": datetime.utcnow()
    }
    
    await db.flashcards.update_one(
        {"_id": ObjectId(card_id)},
        {"$set": update_data}
    )
    
    # Return updated card structure
    updated_card = card.copy()
    updated_card.update(update_data)
    updated_card["_id"] = str(updated_card["_id"])
    return updated_card

async def get_next_review_card(set_id: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Selects the next card to review using weighted random selection.
    Cards with higher weights (marked 'not_known' or unreviewed) are more likely to be selected.
    """
    db = get_database()
    
    # Fetch all cards in the set
    cursor = db.flashcards.find({"set_id": set_id, "user_id": user_id})
    cards = await cursor.to_list(length=1000)
    
    if not cards:
        return None
        
    # Weights list
    weights = [card.get("weight", 1.0) for card in cards]
    
    # Weighted random choice
    selected_card = random.choices(cards, weights=weights, k=1)[0]
    
    # Format ID
    selected_card["_id"] = str(selected_card["_id"])
    return selected_card

async def get_set_review_stats(set_id: str, user_id: str) -> Dict[str, Any]:
    """
    Returns the statistics for a specific flashcard set review session.
    """
    db = get_database()
    
    cursor = db.flashcards.find({"set_id": set_id, "user_id": user_id})
    cards = await cursor.to_list(length=1000)
    
    total = len(cards)
    known = sum(1 for c in cards if c.get("status") == "known")
    not_known = sum(1 for c in cards if c.get("status") == "not_known")
    new_cards = sum(1 for c in cards if c.get("status") == "new")
    
    # We can also track average correct rate
    total_reviews = sum(c.get("review_count", 0) for c in cards)
    total_correct = sum(c.get("correct_count", 0) for c in cards)
    
    accuracy = 0.0
    if total_reviews > 0:
        accuracy = round((total_correct / total_reviews) * 100, 1)
        
    return {
        "total": total,
        "known": known,
        "not_known": not_known,
        "new": new_cards,
        "total_reviews": total_reviews,
        "accuracy": accuracy
    }
