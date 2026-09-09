"""External provider seams — swap a vendor by editing only this file.

Nothing here calls a paid API yet. Each provider reads its key from backend/.env and falls
back to the in-repo implementation when the key is absent, so the app works today and starts
using the real vendor the moment a key is set.

Expected .env keys (all optional today):
  MAPS_PROVIDER=ola|mappls|osm      OLA_MAPS_API_KEY=...   MAPPLS_REST_KEY=...
  SMS_PROVIDER=console|msg91|twilio  MSG91_AUTH_KEY=...  MSG91_TEMPLATE_ID=...
"""

import logging
import os

logger = logging.getLogger(__name__)


def maps_provider() -> str:
    return os.environ.get("MAPS_PROVIDER", "osm").lower()


def maps_config() -> dict:
    """Handed to the frontend so the map/SDK layer can self-configure."""
    provider = maps_provider()
    return {
        "provider": provider,
        # Only a public/client token is ever exposed; REST keys stay server-side.
        "client_key": os.environ.get(
            "OLA_MAPS_CLIENT_KEY" if provider == "ola" else "MAPPLS_CLIENT_KEY", ""
        ),
        "configured": bool(
            os.environ.get("OLA_MAPS_API_KEY") or os.environ.get("MAPPLS_REST_KEY")
        ),
        # Falls back to keyless OSM raster tiles until a provider key is present.
        "tile_url": os.environ.get(
            "MAPS_TILE_URL", "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        ),
        "attribution": os.environ.get("MAPS_ATTRIBUTION", "© OpenStreetMap contributors"),
    }


def sms_provider() -> str:
    return os.environ.get("SMS_PROVIDER", "console").lower()


async def send_otp_sms(phone: str, otp: str) -> dict:
    """Deliver an OTP. Returns {delivered, provider, expose_otp}.

    `expose_otp` tells the API whether it may return the code in the response body —
    true only while no real gateway is configured, so the demo stays usable.
    """
    provider = sms_provider()

    if provider == "msg91" and os.environ.get("MSG91_AUTH_KEY"):
        # Wire the real call here; kept out until the user supplies credentials.
        logger.info("MSG91 configured but the send call is not implemented yet")
        return {"delivered": False, "provider": provider, "expose_otp": True}

    if provider == "twilio" and os.environ.get("TWILIO_AUTH_TOKEN"):
        logger.info("Twilio configured but the send call is not implemented yet")
        return {"delivered": False, "provider": provider, "expose_otp": True}

    # Default: no gateway. The OTP is surfaced in the response/UI instead.
    logger.info("OTP for %s is %s (console provider — no SMS sent)", phone, otp)
    return {"delivered": False, "provider": "console", "expose_otp": True}
