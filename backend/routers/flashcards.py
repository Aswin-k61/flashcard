from fastapi import APIRouter, HTTPException, Depends, status
from bson import ObjectId
from datetime import datetime
from typing import List, Dict, Any
from backend.database import get_database
from backend.dependencies import get_current_user
from backend.models.flashcard import FlashcardGenerateRequest
from backend.services.nlp_service import generate_flashcards

router = APIRouter()

@router.post("/generate", status_code=status.HTTP_201_CREATED)
async def generate(req: FlashcardGenerateRequest, current_user: dict = Depends(get_current_user)):
    text = req.text.strip()
    if len(text) < 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text notes must be at least 50 characters long."
        )
        
    # Generate cards using NLP service
    cards_data = generate_flashcards(text)
    if not cards_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not generate any flashcards from the provided text. Try adding more detailed sentences."
        )
        
    db = get_database()
    
    # Auto-generate title if not provided
    title = req.title.strip() if req.title else ""
    if not title:
        # Grab first 4-5 words or first sentence
        first_sentence = text.split(".")[0].strip()
        words = first_sentence.split()
        title = " ".join(words[:5]) + ("..." if len(words) > 5 else "")
        if not title:
            title = "Untitled Study Notes"
            
    # Create flashcard set
    set_doc = {
        "user_id": current_user["_id"],
        "title": title,
        "source_text": text,
        "card_count": len(cards_data),
        "created_at": datetime.utcnow()
    }
    
    set_result = await db.flashcard_sets.insert_one(set_doc)
    set_id = str(set_result.inserted_id)
    set_doc["_id"] = set_id
    
    # Insert individual flashcards
    inserted_cards = []
    for card in cards_data:
        card_doc = {
            "set_id": set_id,
            "user_id": current_user["_id"],
            "question": card["question"],
            "answer": card["answer"],
            "status": "new",
            "review_count": 0,
            "correct_count": 0,
            "last_reviewed": None,
            "weight": 1.0,
            "created_at": datetime.utcnow()
        }
        card_result = await db.flashcards.insert_one(card_doc)
        card_doc["_id"] = str(card_result.inserted_id)
        inserted_cards.append(card_doc)
        
    return {
        "set": set_doc,
        "cards": inserted_cards
    }

@router.get("/sets")
async def get_sets(current_user: dict = Depends(get_current_user)):
    db = get_database()
    user_id = current_user["_id"]
    
    # Fetch sets
    cursor = db.flashcard_sets.find({"user_id": user_id}).sort("created_at", -1)
    sets = await cursor.to_list(length=100)
    
    formatted_sets = []
    for s in sets:
        set_id = str(s["_id"])
        
        # Count card statuses for statistics
        known_count = await db.flashcards.count_documents({"set_id": set_id, "status": "known"})
        not_known_count = await db.flashcards.count_documents({"set_id": set_id, "status": "not_known"})
        new_count = await db.flashcards.count_documents({"set_id": set_id, "status": "new"})
        
        s["_id"] = set_id
        s["stats"] = {
            "known": known_count,
            "not_known": not_known_count,
            "new": new_count
        }
        formatted_sets.append(s)
        
    return formatted_sets

@router.get("/sets/{set_id}")
async def get_set(set_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    user_id = current_user["_id"]
    
    set_doc = await db.flashcard_sets.find_one({"_id": ObjectId(set_id), "user_id": user_id})
    if not set_doc:
        raise HTTPException(status_code=404, detail="Flashcard set not found.")
        
    # Get cards
    cursor = db.flashcards.find({"set_id": set_id, "user_id": user_id})
    cards = await cursor.to_list(length=1000)
    
    # Format IDs
    set_doc["_id"] = str(set_doc["_id"])
    for c in cards:
        c["_id"] = str(c["_id"])
        
    return {
        "set": set_doc,
        "cards": cards
    }

@router.delete("/sets/{set_id}")
async def delete_set(set_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    user_id = current_user["_id"]
    
    result = await db.flashcard_sets.delete_one({"_id": ObjectId(set_id), "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Flashcard set not found.")
        
    # Delete corresponding cards
    await db.flashcards.delete_many({"set_id": set_id, "user_id": user_id})
    
    return {"message": "Flashcard set and associated cards deleted successfully."}

@router.put("/cards/{card_id}")
async def update_card_details(card_id: str, card_data: dict, current_user: dict = Depends(get_current_user)):
    db = get_database()
    user_id = current_user["_id"]
    
    # Check if card exists and belongs to user
    card = await db.flashcards.find_one({"_id": ObjectId(card_id), "user_id": user_id})
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found.")
        
    question = card_data.get("question", "").strip()
    answer = card_data.get("answer", "").strip()
    
    if not question or not answer:
        raise HTTPException(status_code=400, detail="Question and answer cannot be empty.")
        
    await db.flashcards.update_one(
        {"_id": ObjectId(card_id)},
        {"$set": {"question": question, "answer": answer}}
    )
    
    return {"message": "Card updated successfully."}

@router.delete("/cards/{card_id}")
async def delete_single_card(card_id: str, current_user: dict = Depends(get_current_user)):
    db = get_database()
    user_id = current_user["_id"]
    
    card = await db.flashcards.find_one({"_id": ObjectId(card_id), "user_id": user_id})
    if not card:
        raise HTTPException(status_code=404, detail="Flashcard not found.")
        
    # Get set to update set card count
    set_id = card["set_id"]
    
    await db.flashcards.delete_one({"_id": ObjectId(card_id)})
    
    # Update card count in set
    await db.flashcard_sets.update_one(
        {"_id": ObjectId(set_id)},
        {"$inc": {"card_count": -1}}
    )
    
    return {"message": "Card deleted successfully."}

