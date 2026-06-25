from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, List

class FlashcardSetBase(BaseModel):
    title: str
    source_text: str

class FlashcardSetCreate(FlashcardSetBase):
    pass

class FlashcardSetResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    title: str
    source_text: str
    card_count: int
    created_at: datetime
    # We can include optional stats
    stats: Optional[dict] = None

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class FlashcardBase(BaseModel):
    question: str
    answer: str

class FlashcardCreate(FlashcardBase):
    pass

class FlashcardResponse(FlashcardBase):
    id: str = Field(alias="_id")
    set_id: str
    user_id: str
    status: str  # "new" | "known" | "not_known"
    review_count: int
    correct_count: int
    last_reviewed: Optional[datetime] = None
    weight: float
    created_at: datetime

    class Config:
        populate_by_name = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class FlashcardGenerateRequest(BaseModel):
    text: str
    title: Optional[str] = None

class ReviewStatusUpdate(BaseModel):
    status: str  # "known" | "not_known"
