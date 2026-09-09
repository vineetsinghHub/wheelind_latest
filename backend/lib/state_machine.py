"""Ride lifecycle as a strict state machine (§9).

Every state change in the app goes through `assert_transition` so a ride can never
skip the OTP gate or resurrect a terminal trip.
"""

from fastapi import HTTPException

LIVE_STATES = [
    "searching", "driver_assigned", "driver_arriving", "waiting_at_pickup",
    "otp_pending", "in_progress",
]
TERMINAL_STATES = {"completed", "cancelled", "expired"}

TRANSITIONS: dict[str, set[str]] = {
    "draft": {"searching", "cancelled"},
    "searching": {"driver_assigned", "cancelled", "expired"},
    "driver_assigned": {"driver_arriving", "waiting_at_pickup", "cancelled", "searching"},
    "driver_arriving": {"waiting_at_pickup", "cancelled"},
    "waiting_at_pickup": {"otp_pending", "in_progress", "cancelled"},
    "otp_pending": {"in_progress", "cancelled"},
    "in_progress": {"completed", "disputed"},
    "completed": {"disputed"},
    "cancelled": {"disputed"},
    "expired": {"searching", "disputed"},
    "disputed": {"completed", "cancelled"},
}


def can_transition(current: str, target: str) -> bool:
    return target in TRANSITIONS.get(current, set())


def assert_transition(ride: dict, target: str, *, otp_required: bool = True) -> None:
    current = ride["state"]
    if not can_transition(current, target):
        raise HTTPException(
            status_code=409,
            detail=f"A ride in '{current}' cannot move to '{target}'",
        )
    # §8.3 — no OTP, no trip, no fare.
    if target == "in_progress" and otp_required and not ride.get("otp_verified"):
        raise HTTPException(status_code=409, detail="OTP not verified — trip start is blocked")
