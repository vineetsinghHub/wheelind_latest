"""Admin RBAC — one decision point for every admin write.

Reads are open to any authenticated admin (the console is internal); every mutation
declares a permission and is denied by default when the role does not hold it.
Roles come from the DB on each request via `current_admin`, so a role change takes
effect immediately instead of at session expiry.
"""

from fastapi import Depends, HTTPException

from lib.auth import current_admin
from models.schemas import AdminUser

# Permission catalogue. Keep the strings stable — audit logs reference them.
PERMISSIONS = [
    "pricing.write",      # fare configs
    "commission.write",   # commission % + subscription passes
    "flags.write",        # feature flags
    "campaigns.write",    # rider/driver offers
    "kyc.review",         # driver documents + KYC decisions
    "drivers.write",      # driver records, online override, flags
    "riders.write",       # rider status / prepaid-only
    "rides.write",        # ride state overrides
    "refunds.write",      # money back to a rider
    "payouts.write",      # driver payout runs
    "sos.write",          # SOS incident actions
    "disputes.write",     # support case resolution
]

ROLE_PERMISSIONS: dict[str, set[str]] = {
    # Founder/CTO level — everything, including money movement.
    "super_admin": set(PERMISSIONS),
    # Supply side: partners, documents, fleet, payouts.
    "fleet_manager": {
        "kyc.review", "drivers.write", "rides.write", "sos.write", "disputes.write",
        "payouts.write", "commission.write",
    },
    # Demand/ops side: rides, riders, campaigns, safety, support.
    "ops_lead": {
        "rides.write", "riders.write", "campaigns.write", "sos.write", "disputes.write",
        "refunds.write",
    },
}


def has_permission(role: str, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())


def require(permission: str):
    """Route dependency: `dependencies=[Depends(require("pricing.write"))]`."""
    if permission not in PERMISSIONS:  # fail loudly at import time, not at request time
        raise ValueError(f"unknown permission '{permission}'")

    async def _guard(admin: AdminUser = Depends(current_admin)) -> AdminUser:
        if not has_permission(admin.role, permission):
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({admin.role.replace('_', ' ')}) cannot perform '{permission}'",
            )
        return admin

    return _guard


def permissions_for(role: str) -> list[str]:
    return sorted(ROLE_PERMISSIONS.get(role, set()))
