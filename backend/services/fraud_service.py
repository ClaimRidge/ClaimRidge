import logging
import os
import pandas as pd
import xgboost as xgb
from typing import Dict, Any
import joblib
import datetime

logger = logging.getLogger(__name__)

class FraudDetector:
    KEY_SIGNAL_FIELDS = [
        ("patient_age", "numeric", ()),
        ("patient_gender", "categorical", ("gender",)),
        ("diagnosis_code", "categorical", ("diagnosis",)),
        ("procedure_code", "categorical", ("procedure",)),
        ("claim_amount", "numeric", ("requested_amount",)),
        ("visit_type", "categorical", ()),
        ("provider_specialty", "categorical", ()),
        ("insurance_type", "categorical", ()),
        ("length_of_stay", "numeric", ()),
        ("patient_state", "categorical", ()),
    ]
    MISSING_THRESHOLD = 5

    def __init__(
        self,
        model_path: str = "models/production_fraud_model.xgb",
        encoder_path: str = "models/production_label_encoders.pkl",
        feature_names_path: str = "models/feature_names.pkl",
    ):
        self.model_path = model_path
        self.encoder_path = encoder_path
        self.feature_names_path = feature_names_path
        self.model = self._load_model()
        self.encoders = self._load_encoders()
        self.feature_names = self._load_feature_names()
        self.threshold = 70.0
        self.extreme_threshold = 90.0

    def _resolve(self, rel_path: str) -> str:
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_path, rel_path)

    def _load_model(self):
        full_model_path = self._resolve(self.model_path)
        if os.path.exists(full_model_path):
            model = xgb.XGBClassifier()
            model.load_model(full_model_path)
            logger.info(f"✅ Production XGBoost Fraud model successfully loaded from {full_model_path}")
            return model
        logger.warning(f"⚠️ Fraud model not found at {full_model_path}")
        return None

    def _load_encoders(self):
        full_encoder_path = self._resolve(self.encoder_path)
        if os.path.exists(full_encoder_path):
            return joblib.load(full_encoder_path)
        return None

    def _load_feature_names(self):
        full_path = self._resolve(self.feature_names_path)
        if os.path.exists(full_path):
            names = joblib.load(full_path)
            logger.info(f"✅ Feature names loaded ({len(names)} features) from {full_path}")
            return list(names)
        logger.warning(f"⚠️ feature_names.pkl not found at {full_path}; falling back to model.feature_names_in_")
        return list(getattr(self.model, "feature_names_in_", [])) if self.model is not None else []

    @staticmethod
    def _is_missing(value, kind: str) -> bool:
        if value is None:
            return True
        if kind == "numeric":
            try:
                return float(value) == 0.0
            except (TypeError, ValueError):
                return True
        if kind == "categorical":
            s = str(value).strip().lower()
            return s in {"", "unknown", "none", "n/a", "null"}
        return False

    def _check_data_completeness(self, claim_data: Dict[str, Any]):
        missing = []
        for primary, kind, aliases in self.KEY_SIGNAL_FIELDS:
            value = claim_data.get(primary)
            if self._is_missing(value, kind):
                for alias in aliases:
                    alt = claim_data.get(alias)
                    if not self._is_missing(alt, kind):
                        value = alt
                        break
            if self._is_missing(value, kind):
                missing.append(primary)
        return missing

    async def analyze_claim(self, claim_data: Dict[str, Any]) -> dict:
        if not self.model:
            return {"risk_level": "low", "fraud_score": 0.0, "flags": []}

        missing_fields = self._check_data_completeness(claim_data)
        if len(missing_fields) >= self.MISSING_THRESHOLD:
            flag = (
                f"insufficient_structured_data: {len(missing_fields)}/"
                f"{len(self.KEY_SIGNAL_FIELDS)} key fields missing or unknown "
                f"({', '.join(missing_fields)}). Statistical fraud score is unreliable."
            )
            logger.info(
                f"Skipping fraud scoring: {len(missing_fields)} missing fields "
                f"({missing_fields})"
            )
            return {
                "risk_level": "insufficient_data",
                "fraud_score": None,
                "flags": [flag],
                "missing_fields": missing_fields,
            }

        try:
            features_df = self._extract_features(claim_data)
            score = float(self.model.predict_proba(features_df)[0][1])
            score_percentage = round(score * 100, 2)

            if score_percentage >= self.extreme_threshold:
                return {
                    "risk_level": "extreme",
                    "fraud_score": score_percentage,
                    "flags": [f"Extreme statistical anomaly ({score_percentage}%) — denial-tier"],
                }
            if score_percentage > self.threshold:
                return {
                    "risk_level": "high",
                    "fraud_score": score_percentage,
                    "flags": [f"High statistical anomaly ({score_percentage}%) — escalate-tier"],
                }
            return {"risk_level": "low", "fraud_score": score_percentage, "flags": []}
        except Exception as e:
            logger.error(f"ML inference execution failed: {e}")
            return {"risk_level": "low", "fraud_score": 0.0, "flags": []}

    def _safe_encode(self, column: str, value: str) -> int:
        if not self.encoders or column not in self.encoders:
            return 0
        encoder = self.encoders[column]
        val_str = str(value)
        if val_str in encoder.classes_:
            return int(encoder.transform([val_str])[0])
        return int(encoder.transform(['Unknown'])[0]) if 'Unknown' in encoder.classes_ else 0

    def _extract_features(self, claim_data: Dict[str, Any]) -> pd.DataFrame:
        now = datetime.datetime.now()

        def safe_float(key, default=0.0):
            try: return float(claim_data.get(key, default))
            except: return default

        # Mapping database snake_case fields to Model CamelCase fields
        data = {
            'Patient_Age': safe_float("patient_age"),
            'Patient_Gender': self._safe_encode("Patient_Gender", claim_data.get("patient_gender", claim_data.get("gender", "Unknown"))),
            'Patient_State': self._safe_encode("Patient_State", claim_data.get("patient_state", "Unknown")),
            'Diagnosis_Code': self._safe_encode("Diagnosis_Code", claim_data.get("diagnosis_code", claim_data.get("diagnosis", "Unknown"))),
            'Procedure_Code': self._safe_encode("Procedure_Code", claim_data.get("procedure_code", claim_data.get("procedure", "Unknown"))),
            'Chronic_Condition_Flag': int(safe_float("chronic_condition_flag", safe_float("chronic_condition", 0))),
            'Length_of_Stay': safe_float("length_of_stay", 1.0),
            'Visit_Type': self._safe_encode("Visit_Type", claim_data.get("visit_type", "Unknown")),
            'Claim_Amount': safe_float("claim_amount", safe_float("requested_amount")),
            'Insurance_Type': self._safe_encode("Insurance_Type", claim_data.get("insurance_type", "Unknown")),
            'Prior_Visits_12m': safe_float("prior_visits_12m"),
            'Days_Between_Service_and_Claim': int(safe_float("days_between_service_and_claim", safe_float("days_between_service", 0))),
            'Provider_Specialty': self._safe_encode("Provider_Specialty", claim_data.get("provider_specialty", "Unknown")),
            'Submission_Month': int(claim_data.get("submission_month") or now.month),
            'Submission_DayOfWeek': int(claim_data.get("submission_day_of_week") or now.weekday())
        }
        
        expected_columns = self.feature_names or list(data.keys())
        missing = [c for c in expected_columns if c not in data]
        if missing:
            raise ValueError(f"Feature builder missing columns required by model: {missing}")

        return pd.DataFrame([data])[expected_columns]

fraud_detector = FraudDetector()