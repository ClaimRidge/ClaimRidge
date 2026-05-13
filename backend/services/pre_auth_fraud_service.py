"""Pre-auth fraud detector — STUB.

The legacy pipeline reused the claims-side XGBoost model for pre-auth scoring.
That model was trained on retrospective claims data and is not appropriate for
prospective authorisation requests, so it has been detached from the pre-auth
flow. A dedicated pre-auth fraud model will replace this stub in a future
iteration.

Until then this module returns `low` risk for every request, which means the
pre-auth pipeline runs LLM clinical/policy review on every submission without
any statistical gating. Swap the `analyze_pre_auth` implementation when the
real model arrives — the call site in `services/ai_services.py` will not need
to change.
"""

import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


class PreAuthFraudDetectorStub:
    threshold = 70.0
    extreme_threshold = 90.0

    async def analyze_pre_auth(self, request_data: Dict[str, Any]) -> dict:
        logger.debug(
            "pre_auth_fraud_service stub invoked — returning low risk "
            "(no dedicated pre-auth model is wired yet)."
        )
        return {
            "risk_level": "low",
            "fraud_score": 0.0,
            "flags": [],
        }


pre_auth_fraud_detector = PreAuthFraudDetectorStub()
