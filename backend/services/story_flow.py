"""
Story-Flow service: Parse and generate multi-speaker stories.
"""

import re
import logging
import uuid
import time
import asyncio
from typing import List

from sqlalchemy.orm import Session

from ..models import (
    StoryFlowSpeakerConfig,
    StoryFlowTurn,
    StoryFlowGenerationResult,
)
from . import history, task_queue
from .generation import run_generation

logger = logging.getLogger(__name__)

# Pattern to match <[SpeakerName]> text turns
# Only uses <[SpeakerName]> to avoid confusion with emotion tags like (laugh)
_TURN_PATTERN = re.compile(r"<\[([^\]]+)\]>\s*(.+?)(?=<\[|$)", re.DOTALL)


def parse_story_script(
    script: str,
    speakers: List[StoryFlowSpeakerConfig],
) -> List[StoryFlowTurn]:
    """
    Parse a story script into individual turns.

    Args:
        script: Raw script with [SpeakerName] markers
        speakers: List of speaker configurations

    Returns:
        List of parsed turns with speaker configs

    Raises:
        ValueError: If a speaker name in the script doesn't match any configured speaker
    """
    turns: List[StoryFlowTurn] = []

    # Create a lookup dict for speakers by name (case-insensitive)
    speaker_by_name = {s.name.lower(): s for s in speakers}

    # Find all matches - only <[SpeakerName]> format
    matches = list(_TURN_PATTERN.finditer(script))

    if not matches:
        raise ValueError(
            "No valid turns found in script. Use <[SpeakerName]> format, e.g.:\n"
            "<[Mark]> Hello!\n<[Emily]> Hi Mark!"
        )

    for turn_index, match in enumerate(matches):
        speaker_name = match.group(1).strip()
        text = match.group(2).strip()

        if not text:
            continue  # Skip empty turns

        # Look up speaker config (case-insensitive)
        speaker_config = speaker_by_name.get(speaker_name.lower())
        if speaker_config is None:
            available = ", ".join(s.name for s in speakers)
            raise ValueError(
                f"Unknown speaker: '{speaker_name}'. "
                f"Configured speakers are: {available}"
            )

        turns.append(
            StoryFlowTurn(
                turn_index=turn_index,
                speaker_name=speaker_name,
                speaker_config=speaker_config,
                text=text,
            )
        )

    return turns


async def generate_story_flow(
    script: str,
    speakers: List[StoryFlowSpeakerConfig],
    db: Session,
    generate_in_order: bool = True,
) -> List[StoryFlowGenerationResult]:
    """
    Generate audio for all turns in a story script.

    Uses the task queue to enqueue each turn as a separate generation,
    then waits for completion.

    Args:
        script: Raw story script with [SpeakerName] markers
        speakers: List of speaker configurations
        db: Database session
        generate_in_order: If True, generate sequentially; if False, parallel

    Returns:
        List of generation results in order

    Raises:
        ValueError: If script parsing fails
    """
    from ..backends import engine_has_model_sizes

    # Parse the script
    turns = parse_story_script(script, speakers)

    if not turns:
        raise ValueError("No valid turns to generate")

    results: List[StoryFlowGenerationResult] = []

    if generate_in_order:
        # Generate sequentially (best for consistency)
        for turn in turns:
            logger.info(
                f"Generating turn {turn.turn_index + 1}/{len(turns)}: "
                f"[{turn.speaker_name}] {turn.text[:50]}..."
            )
            result = await _enqueue_and_wait_turn(turn, db, engine_has_model_sizes)
            results.append(result)

            if result.status == "failed":
                logger.warning(f"Turn {turn.turn_index} failed: {result.error}")

    else:
        # TODO: Parallel generation via asyncio.gather of enqueued tasks
        # For now, fall back to sequential
        for turn in turns:
            result = await _enqueue_and_wait_turn(turn, db, engine_has_model_sizes)
            results.append(result)

    return results


async def _enqueue_and_wait_turn(
    turn: StoryFlowTurn,
    db: Session,
    engine_has_model_sizes,
) -> StoryFlowGenerationResult:
    """
    Enqueue a single turn and wait for it to complete.

    Args:
        turn: Parsed turn with speaker config
        db: Database session
        engine_has_model_sizes: Function to check if engine has model sizes

    Returns:
        Generation result for the turn
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[STORY_FLOW] Starting turn {turn.turn_index}: {turn.speaker_name}")

    from ..backends import engine_needs_trim
    from ..database import VoiceProfile as DBVoiceProfile

    config = turn.speaker_config

    try:
        # Validate profile exists if voice_profile_id is provided
        profile_id = config.voice_profile_id
        if profile_id:
            profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
            if not profile:
                raise ValueError(f"Profile not found: {profile_id}")

        generation_id = str(uuid.uuid4())

        engine = config.engine
        model_size = config.model_size if engine_has_model_sizes(engine) else None

        # Create generation record
        generation = await history.create_generation(
            profile_id=profile_id or "",
            text=turn.text,
            language=config.language,
            audio_path="",
            duration=0,
            seed=None,
            db=db,
            generation_id=generation_id,
            status="generating",
            engine=engine,
            model_size=model_size,
        )

        # Enqueue the generation coroutine (same pattern as generations.py)
        logger.info(f"[STORY_FLOW] Enqueueing generation {generation_id}")
        try:
            task_queue.enqueue_generation(
                generation_id,
                run_generation(
                    generation_id=generation_id,
                    profile_id=profile_id or "",
                    text=turn.text,
                    language=config.language,
                    engine=engine,
                    model_size=model_size or "1.7B",
                    seed=None,
                    normalize=False,
                    effects_chain=(
                        [e.model_dump() for e in config.effects_chain]
                        if config.effects_chain else None
                    ),
                    instruct=None,
                    mode="generate",
                )
            )
            logger.info(f"[STORY_FLOW] Enqueue call completed for {generation_id}")
        except Exception as e:
            logger.error(f"[STORY_FLOW] Enqueue failed: {e}")
            raise

        logger.info(f"[STORY_FLOW] Waiting for {generation_id}...")

        # Wait for completion by polling the database
        timeout_seconds = 600  # 10 minutes max per turn
        start_time = time.time()

        while True:
            # Check generation status directly from DB
            final_gen = await history.get_generation(generation_id, db)

            if final_gen is not None:
                if final_gen.status == "completed":
                    return StoryFlowGenerationResult(
                        turn_index=turn.turn_index,
                        speaker_name=turn.speaker_name,
                        generation_id=generation_id,
                        text=turn.text,
                        audio_path=final_gen.audio_path if final_gen else None,
                        duration=final_gen.duration if final_gen else None,
                        status="completed",
                        error=None,
                    )
                elif final_gen.status == "failed":
                    return StoryFlowGenerationResult(
                        turn_index=turn.turn_index,
                        speaker_name=turn.speaker_name,
                        generation_id=generation_id,
                        text=turn.text,
                        audio_path=None,
                        duration=None,
                        status="failed",
                        error=final_gen.error or "Generation failed",
                    )

            elapsed = time.time() - start_time
            if elapsed > timeout_seconds:
                raise TimeoutError(f"Generation timed out after {timeout_seconds}s")

            # Poll every 0.5 seconds
            await asyncio.sleep(0.5)

    except Exception as e:
        logger.error(f"Generation failed for turn {turn.turn_index}: {e}")
        return StoryFlowGenerationResult(
            turn_index=turn.turn_index,
            speaker_name=turn.speaker_name,
            generation_id="",
            text=turn.text,
            status="failed",
            error=str(e),
        )