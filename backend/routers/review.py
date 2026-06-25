from fastapi import APIRouter, HTTPException, Depends, status
from backend.dependencies import get_current_user
from backend.models.flashcard import ReviewStatusUpdate
from backend.services.review_service import get_next_review_card, update_card_review, get_set_review_stats

router = APIRouter()

@router.get("/{set_id}/next")
async def get_next(set_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    card = await get_next_review_card(set_id, user_id)
    if not card:
        return {"card": None}
    return {"card": card}

@router.patch("/{card_id}")
async def update_card(card_id: str, req: ReviewStatusUpdate, current_user: dict = Depends(get_current_user)):
    if req.status not in ["known", "not_known"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be either 'known' or 'not_known'"
        )
        
    try:
        updated_card = await update_card_review(card_id, req.status)
        return {"card": updated_card}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error updating card: {e}")

@router.get("/{set_id}/stats")
async def get_stats(set_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["_id"]
    try:
        stats = await get_set_review_stats(set_id, user_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting statistics: {e}")
