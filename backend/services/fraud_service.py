import logging
import os
import pandas as pd
import xgboost as xgb
from typing import Dict, Any
import hashlib
import joblib

logger = logging.getLogger(__name__)

def stable_hash(text: str, max_val: int = 1000) -> int:
    """Generates a consistent, deterministic integer from a string."""
    if not text:
        text = "Unknown"
    # Create a stable MD5 hash and convert the first few bytes to an integer
    return int(hashlib.md5(str(text).encode('utf-8')).hexdigest()[:8], 16) % max_val

class FraudDetector:
    def __init__(self, model_path: str = "models/layer1_anomaly_v1.xgb", encoder_path: str = "models/label_encoders.pkl"):
        self.model_path = model_path
        self.encoder_path = encoder_path
        self.model = self._load_model()
        self.encoders = self._load_encoders()
        self.threshold = 85.0

    def _load_model(self):
        if os.path.exists(self.model_path):
            model = xgb.XGBClassifier()
            model.load_model(self.model_path)
            logger.info("✅ Pre-trained XGBoost Fraud model successfully loaded into memory.")
            return model
        return None
    
    def _load_encoders(self):
        if os.path.exists(self.encoder_path):
            model = joblib.load(self.encoder_path)
            logger.info("✅ Label encoders successfully loaded into memory.")
            return model
        return None

    async def analyze_claim(self, claim_data: Dict[str, Any]) -> dict:
        """Runs the native XGBoost inference on the incoming claim data."""
        if not self.model:
            # Fallback to mock if file is missing
            if float(claim_data.get("requested_amount") or 0.0) == 9999:
                return {"risk_level": "high", "fraud_score": 98.5, "flags": ["Mock Trigger: 9999 amount"]}
            return {"risk_level": "low", "fraud_score": 0.0, "flags": []}

        try:
            # Extract features exactly as the model was trained
            features_df = self._extract_features(claim_data)
            
            # Predict Probability
            score = float(self.model.predict_proba(features_df)[0][1])
            is_anomaly = score > self.threshold
            score_percentage = round(score * 100, 2)

            if is_anomaly:
                return {
                    "risk_level": "high",
                    "fraud_score": score_percentage,
                    "flags": [f"High statistical anomaly detected (Confidence: {score_percentage}%)"]
                }
                
            return {
                "risk_level": "low",
                "fraud_score": score_percentage,
                "flags": []
            }
        except Exception as e:
            logger.error(f"ML inference execution failed: {e}")
            return {"risk_level": "low", "fraud_score": 0.0, "flags": []}

    def _safe_encode(self, column: str, value: str) -> int:
        """Safely encodes a string. If the model has never seen it, it falls back to 'Unknown'."""
        if not self.encoders or column not in self.encoders:
            return 0
        try:
            return int(self.encoders[column].transform([str(value)])[0])
        except ValueError:
            return int(self.encoders[column].transform(['Unknown'])[0])

    def _extract_features(self, claim_data: Dict[str, Any]) -> pd.DataFrame:
        """Uses the exact LabelEncoders from training!"""
        
        # Safely parse numbers
        try:
            req_amount = float(claim_data.get("requested_amount", 0.0))
        except (ValueError, TypeError):
            req_amount = 0.0
            
        try:
            age = float(claim_data.get("patient_age", 0.0))
        except (ValueError, TypeError):
            age = 0.0

        # Build the exact Fatal 6 payload using the true Encoders
        data = {
            "Provider_ID": self._safe_encode("Provider_ID", claim_data.get("provider_name", "Unknown")),
            "Patient_Age": age,
            "Patient_Gender": self._safe_encode("Patient_Gender", claim_data.get("gender", "Unknown")),
            "Diagnosis_Code": self._safe_encode("Diagnosis_Code", claim_data.get("diagnosis", "Unknown")),
            "Procedure_Code": self._safe_encode("Procedure_Code", claim_data.get("procedure", "Unknown")),
            "Claim_Amount": req_amount
        }
        
        return pd.DataFrame([data])

# Singleton instance
fraud_detector = FraudDetector()