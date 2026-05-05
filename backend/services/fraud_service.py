import logging
import os
import pandas as pd
import xgboost as xgb
from typing import Dict, Any
import joblib
import datetime

logger = logging.getLogger(__name__)

class FraudDetector:
    def __init__(self, model_path: str = "models/layer1_anomaly_v1.xgb", encoder_path: str = "models/label_encoders.pkl"):
        self.model_path = model_path
        self.encoder_path = encoder_path
        self.model = self._load_model()
        self.encoders = self._load_encoders()
        self.threshold = 70.0

    def _load_model(self):
        if os.path.exists(self.model_path):
            model = xgb.XGBClassifier()
            model.load_model(self.model_path)
            logger.info("✅ Pre-trained XGBoost Fraud model successfully loaded.")
            return model
        return None
    
    def _load_encoders(self):
        if os.path.exists(self.encoder_path):
            return joblib.load(self.encoder_path)
        return None

    async def analyze_claim(self, claim_data: Dict[str, Any]) -> dict:
        if not self.model:
            return {"risk_level": "low", "fraud_score": 0.0, "flags": []}

        try:
            features_df = self._extract_features(claim_data)
            score = float(self.model.predict_proba(features_df)[0][1])
            score_percentage = round(score * 100, 2)
            is_anomaly = score_percentage > self.threshold

            if is_anomaly:
                return {
                    "risk_level": "high",
                    "fraud_score": score_percentage,
                    "flags": [f"High statistical anomaly detected ({score_percentage}%)"]
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

        req_amount = safe_float("requested_amount")
        # Proxies for 22-feature model
        approved_amount = req_amount 
        approved_ratio = approved_amount / (req_amount + 1e-5)
        days_between = int(safe_float("days_between_service", 0))

        data = {
            'Patient_Age': safe_float("patient_age"),
            'Patient_Gender': self._safe_encode("Patient_Gender", claim_data.get("gender", "Unknown")),
            'Diagnosis_Code': self._safe_encode("Diagnosis_Code", claim_data.get("diagnosis", "Unknown")),
            'Procedure_Code': self._safe_encode("Procedure_Code", claim_data.get("procedure", "Unknown")),
            'Claim_Amount': req_amount,
            'Approved_Amount': approved_amount,
            'Insurance_Type': self._safe_encode("Insurance_Type", claim_data.get("insurance_type", "Unknown")),
            'Days_Between_Service_and_Claim': days_between,
            'Number_of_Claims_Per_Provider_Monthly': safe_float("provider_monthly_claims", 50.0),
            'Provider_Specialty': self._safe_encode("Provider_Specialty", claim_data.get("provider_specialty", "Unknown")),
            'Patient_State': self._safe_encode("Patient_State", claim_data.get("patient_state", "Unknown")),
            'Claim_Status': self._safe_encode("Claim_Status", "Pending"),
            'Length_of_Stay': safe_float("length_of_stay"),
            'Visit_Type': self._safe_encode("Visit_Type", claim_data.get("visit_type", "Unknown")),
            'Chronic_Condition_Flag': int(safe_float("chronic_condition", 0)),
            'Prior_Visits_12m': safe_float("prior_visits_12m"),
            'Submission_Month': now.month,
            'Submission_DayOfWeek': now.weekday(),
            'Amount_Discrepancy': 0.0,
            'Approved_to_Claimed_Ratio': approved_ratio,
            'Is_Fast_Submission': 1 if days_between <= 1 else 0,
            'Provider_Claim_Volume': safe_float("provider_claim_volume", 500.0)
        }
        
        expected_columns = [
            'Patient_Age', 'Patient_Gender', 'Diagnosis_Code', 'Procedure_Code',
            'Claim_Amount', 'Approved_Amount', 'Insurance_Type', 'Days_Between_Service_and_Claim',
            'Number_of_Claims_Per_Provider_Monthly', 'Provider_Specialty', 'Patient_State',
            'Claim_Status', 'Length_of_Stay', 'Visit_Type', 'Chronic_Condition_Flag',
            'Prior_Visits_12m', 'Submission_Month', 'Submission_DayOfWeek', 'Amount_Discrepancy',
            'Approved_to_Claimed_Ratio', 'Is_Fast_Submission', 'Provider_Claim_Volume'
        ]
        
        return pd.DataFrame([data])[expected_columns]

fraud_detector = FraudDetector()