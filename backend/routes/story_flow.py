"""
Story-Flow API routes: Parse and generate multi-speaker stories.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    StoryFlowParseRequest,
    StoryFlowParseResponse,
    StoryFlowGenerateRequest,
    StoryFlowGenerateResponse,
    StoryFlowGenerationResult,
)
from ..services.story_flow import parse_story_script, generate_story_flow

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/story-flow", tags=["story-flow"])


@router.post("/parse", response_model=StoryFlowParseResponse)
async def parse_script(
    request: StoryFlowParseRequest,
    db: Session = Depends(get_db),
) -> StoryFlowParseResponse:
    """
    Parse a story script without generating audio.

    Use this to preview how the script will be parsed before generating.
    """
    try:
        turns = parse_story_script(request.script, request.speakers)

        total_chars = sum(len(t.text) for t in turns)

        return StoryFlowParseResponse(
            turns=turns,
            total_turns=len(turns),
            total_characters=total_chars,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate", response_model=StoryFlowGenerateResponse)
async def generate_story(
    request: StoryFlowGenerateRequest,
    db: Session = Depends(get_db),
) -> StoryFlowGenerateResponse:
    """
    Generate audio for all turns in a story script.

    Generates each turn sequentially in order. Each turn uses its speaker's
    configured language, engine, and effects.
    """
    try:
        results = await generate_story_flow(
            script=request.script,
            speakers=request.speakers,
            db=db,
            generate_in_order=request.generate_in_order,
        )

        successful = sum(1 for r in results if r.status == "completed")
        failed = len(results) - successful
        total_duration = sum(
            (r.duration or 0) for r in results if r.status == "completed"
        )

        return StoryFlowGenerateResponse(
            results=results,
            total_turns=len(results),
            successful_turns=successful,
            failed_turns=failed,
            total_duration=total_duration,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Story flow generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
