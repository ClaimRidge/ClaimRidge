-- ============================================================
-- Insurer Demo Seed Data — 40 realistic claims
-- Run AFTER the insurer_claims migration
-- Replace YOUR_INSURER_PROFILE_ID with your actual insurer_profiles.id
-- Find it: SELECT id FROM insurer_profiles LIMIT 1;
-- ============================================================

-- Usage:
--   1. Run: SELECT id FROM insurer_profiles LIMIT 1;
--   2. Copy the UUID
--   3. Find-replace YOUR_INSURER_PROFILE_ID with that UUID
--   4. Run this script in Supabase SQL Editor

DO $$
DECLARE
  v_insurer_id UUID;
  v_claim_ids UUID[] := ARRAY[]::UUID[];
  v_id UUID;
BEGIN
  -- Auto-detect insurer profile
  SELECT id INTO v_insurer_id FROM insurer_profiles LIMIT 1;
  IF v_insurer_id IS NULL THEN
    RAISE EXCEPTION 'No insurer_profiles found. Sign up as an insurer first.';
  END IF;

  -- Clean existing demo data
  DELETE FROM claim_flags WHERE claim_id IN (SELECT id FROM insurer_claims WHERE insurer_id = v_insurer_id);
  DELETE FROM insurer_claims WHERE insurer_id = v_insurer_id;

  -- ============================================================
  -- HIGH RISK CLAIMS (10) — ai_risk_score 71-98
  -- ============================================================

  -- Claim 1: Inflated office visit
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00401', 'Jordan Hospital', v_insurer_id, 'Ahmad Al-Hassan', '9981001234', '1985-03-15', 'M', ARRAY['I10'], 'Essential hypertension', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 3, NOW() - INTERVAL '2 hours', 385.00, 'pending', 94, 'likely_reject')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 2: Duplicate MRI
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00402', 'Al-Khalidi Medical Center', v_insurer_id, 'Fatima Al-Masri', '9972005678', '1972-08-22', 'F', ARRAY['M54.5'], 'Low back pain, unspecified', ARRAY['72148'], 'MRI lumbar spine without contrast', CURRENT_DATE - 5, NOW() - INTERVAL '5 hours', 420.00, 'pending', 88, 'likely_reject')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 3: Code mismatch
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00403', 'Istiklal Hospital', v_insurer_id, 'Omar Khalil', '9950103456', '1990-01-10', 'M', ARRAY['J06.9'], 'Acute upper respiratory infection', ARRAY['43239'], 'Upper GI endoscopy with biopsy', CURRENT_DATE - 2, NOW() - INTERVAL '1 hour', 1850.00, 'pending', 96, 'likely_reject')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 4: Pre-auth missing for surgery
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00404', 'Specialty Hospital', v_insurer_id, 'Layla Abu-Rahman', '9885007890', '1988-11-30', 'F', ARRAY['K80.20'], 'Calculus of gallbladder without obstruction', ARRAY['47562'], 'Laparoscopic cholecystectomy', CURRENT_DATE - 7, NOW() - INTERVAL '1 day', 4200.00, 'under_review', 82, 'likely_reject')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 5: Provider billing pattern anomaly
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00405', 'Amman Surgical Hospital', v_insurer_id, 'Yousef Nasser', '9940208765', '1994-06-18', 'M', ARRAY['M23.11'], 'Bucket-handle tear of medial meniscus', ARRAY['29881'], 'Arthroscopy knee, meniscectomy', CURRENT_DATE - 4, NOW() - INTERVAL '8 hours', 5600.00, 'pending', 78, 'review')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 6: Coverage limit near
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00406', 'Ibn Al-Haytham Hospital', v_insurer_id, 'Rania Haddad', '9960304321', '1996-12-05', 'F', ARRAY['C50.911'], 'Malignant neoplasm of unspecified site of right female breast', ARRAY['19301'], 'Mastectomy, partial', CURRENT_DATE - 10, NOW() - INTERVAL '2 days', 7800.00, 'under_review', 75, 'review')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 7: Duplicate service + amount anomaly
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00407', 'Farah Hospital', v_insurer_id, 'Khaled Abudeya', '9930506543', '1993-09-14', 'M', ARRAY['K29.70'], 'Gastritis, unspecified, without bleeding', ARRAY['43239'], 'Upper GI endoscopy with biopsy', CURRENT_DATE - 1, NOW() - INTERVAL '30 minutes', 2100.00, 'pending', 91, 'likely_reject')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 8: Missing documentation
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00408', 'Jordan Hospital', v_insurer_id, 'Nadia Qasem', '9870409876', '1987-04-25', 'F', ARRAY['E11.9'], 'Type 2 diabetes mellitus without complications', ARRAY['36415','83036'], 'Venipuncture + HbA1c test', CURRENT_DATE - 6, NOW() - INTERVAL '12 hours', 95.00, 'pending', 72, 'review')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 9: Unusual volume from clinic
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00409', 'Farah Hospital', v_insurer_id, 'Tareq Mansour', '9920607654', '1992-02-28', 'M', ARRAY['J45.909'], 'Asthma, unspecified, uncomplicated', ARRAY['94640','94060'], 'Nebulizer treatment + bronchospasm evaluation', CURRENT_DATE - 3, NOW() - INTERVAL '4 hours', 280.00, 'pending', 73, 'review')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- Claim 10: High-amount cardiac
  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES ('CLM-2026-00410', 'Specialty Hospital', v_insurer_id, 'Samir Bataineh', '9750801234', '1975-07-03', 'M', ARRAY['I25.10'], 'Atherosclerotic heart disease of native coronary artery', ARRAY['93458'], 'Left heart catheterization', CURRENT_DATE - 8, NOW() - INTERVAL '3 days', 6500.00, 'under_review', 71, 'review')
  RETURNING id INTO v_id;
  v_claim_ids := v_claim_ids || v_id;

  -- ============================================================
  -- MEDIUM RISK CLAIMS (14) — ai_risk_score 31-70
  -- ============================================================

  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES
  ('CLM-2026-00411', 'Al-Khalidi Medical Center', v_insurer_id, 'Hanan Obeidat', '9910902345', '1991-05-12', 'F', ARRAY['N39.0'], 'Urinary tract infection, site not specified', ARRAY['99213','81001'], 'Office visit + urinalysis', CURRENT_DATE - 4, NOW() - INTERVAL '6 hours', 120.00, 'pending', 45, 'review'),
  ('CLM-2026-00412', 'Istiklal Hospital', v_insurer_id, 'Mahmoud Zawaideh', '9831003456', '1983-10-08', 'M', ARRAY['M79.3'], 'Panniculitis, unspecified', ARRAY['20610'], 'Joint injection, major joint', CURRENT_DATE - 9, NOW() - INTERVAL '2 days', 350.00, 'under_review', 55, 'review'),
  ('CLM-2026-00413', 'Jordan Hospital', v_insurer_id, 'Sara Al-Omari', '9951104567', '1995-03-20', 'F', ARRAY['J20.9'], 'Acute bronchitis, unspecified', ARRAY['99213','71046'], 'Office visit + chest X-ray', CURRENT_DATE - 2, NOW() - INTERVAL '3 hours', 165.00, 'pending', 38, 'review'),
  ('CLM-2026-00414', 'Farah Hospital', v_insurer_id, 'Zaid Abu-Ghazaleh', '9891205678', '1989-07-14', 'M', ARRAY['S52.501A'], 'Unspecified fracture of lower end of radius', ARRAY['25600'], 'Closed treatment of distal radial fracture', CURRENT_DATE - 11, NOW() - INTERVAL '3 days', 890.00, 'under_review', 42, 'review'),
  ('CLM-2026-00415', 'Specialty Hospital', v_insurer_id, 'Lina Tarawneh', '9970101234', '1997-01-30', 'F', ARRAY['D25.9'], 'Leiomyoma of uterus, unspecified', ARRAY['76856'], 'Pelvic ultrasound, complete', CURRENT_DATE - 6, NOW() - INTERVAL '1 day', 180.00, 'pending', 35, 'review'),
  ('CLM-2026-00416', 'Ibn Al-Haytham Hospital', v_insurer_id, 'Faisal Rawashdeh', '9800202345', '1980-12-11', 'M', ARRAY['H10.10'], 'Acute atopic conjunctivitis, unspecified eye', ARRAY['99212'], 'Office visit, established patient (level 2)', CURRENT_DATE - 1, NOW() - INTERVAL '45 minutes', 55.00, 'pending', 32, 'review'),
  ('CLM-2026-00417', 'Al-Khalidi Medical Center', v_insurer_id, 'Dina Khasawneh', '9940303456', '1994-08-19', 'F', ARRAY['G43.909'], 'Migraine, unspecified, not intractable', ARRAY['99213','70553'], 'Office visit + MRI brain', CURRENT_DATE - 8, NOW() - INTERVAL '2 days', 520.00, 'under_review', 58, 'review'),
  ('CLM-2026-00418', 'Amman Surgical Hospital', v_insurer_id, 'Basem Alhaj', '9860404567', '1986-05-25', 'M', ARRAY['K40.90'], 'Unilateral inguinal hernia without obstruction', ARRAY['49505'], 'Inguinal hernia repair', CURRENT_DATE - 14, NOW() - INTERVAL '5 days', 2800.00, 'under_review', 65, 'review'),
  ('CLM-2026-00419', 'Jordan Hospital', v_insurer_id, 'Asma Saleh', '9920505678', '1992-11-03', 'F', ARRAY['E03.9'], 'Hypothyroidism, unspecified', ARRAY['99213','84443'], 'Office visit + TSH test', CURRENT_DATE - 5, NOW() - INTERVAL '10 hours', 85.00, 'pending', 33, 'review'),
  ('CLM-2026-00420', 'Istiklal Hospital', v_insurer_id, 'Waleed Dmour', '9780606789', '1978-03-16', 'M', ARRAY['I48.91'], 'Unspecified atrial fibrillation', ARRAY['93000','99214'], 'ECG + office visit (level 4)', CURRENT_DATE - 3, NOW() - INTERVAL '7 hours', 210.00, 'pending', 48, 'review'),
  ('CLM-2026-00421', 'Farah Hospital', v_insurer_id, 'Rana Ajlouni', '9950707890', '1995-09-27', 'F', ARRAY['L30.9'], 'Dermatitis, unspecified', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 7, NOW() - INTERVAL '1 day', 75.00, 'pending', 40, 'review'),
  ('CLM-2026-00422', 'Specialty Hospital', v_insurer_id, 'Muhannad Bani-Hani', '9820808901', '1982-06-08', 'M', ARRAY['M17.11'], 'Primary osteoarthritis, right knee', ARRAY['20610','77073'], 'Joint injection + DXA scan', CURRENT_DATE - 12, NOW() - INTERVAL '4 days', 440.00, 'under_review', 52, 'review'),
  ('CLM-2026-00423', 'Al-Khalidi Medical Center', v_insurer_id, 'Tamara Nsour', '9900909012', '1990-04-15', 'F', ARRAY['O80'], 'Single spontaneous delivery', ARRAY['59400'], 'Routine obstetric care, vaginal delivery', CURRENT_DATE - 15, NOW() - INTERVAL '6 days', 3200.00, 'under_review', 68, 'review'),
  ('CLM-2026-00424', 'Ibn Al-Haytham Hospital', v_insurer_id, 'Imad Zoubi', '9761010123', '1976-02-20', 'M', ARRAY['E78.5'], 'Hyperlipidemia, unspecified', ARRAY['99213','80061'], 'Office visit + lipid panel', CURRENT_DATE - 4, NOW() - INTERVAL '9 hours', 105.00, 'pending', 36, 'review');

  -- ============================================================
  -- LOW RISK CLAIMS (16) — ai_risk_score 0-30
  -- ============================================================

  INSERT INTO insurer_claims (claim_number, clinic_name, insurer_id, patient_name, patient_national_id, patient_dob, patient_gender, diagnosis_codes, diagnosis_description, procedure_codes, procedure_description, service_date, submitted_at, amount_jod, status, ai_risk_score, ai_recommendation)
  VALUES
  ('CLM-2026-00425', 'Jordan Hospital', v_insurer_id, 'Amira Shraideh', '9931111234', '1993-01-07', 'F', ARRAY['J00'], 'Acute nasopharyngitis (common cold)', ARRAY['99212'], 'Office visit, established patient (level 2)', CURRENT_DATE - 2, NOW() - INTERVAL '4 hours', 45.00, 'approved', 8, 'auto_approve'),
  ('CLM-2026-00426', 'Al-Khalidi Medical Center', v_insurer_id, 'Samer Ghawi', '9851212345', '1985-08-30', 'M', ARRAY['I10'], 'Essential hypertension', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 6, NOW() - INTERVAL '1 day', 65.00, 'approved', 12, 'auto_approve'),
  ('CLM-2026-00427', 'Istiklal Hospital', v_insurer_id, 'Lubna Jaradat', '9910113456', '1991-04-18', 'F', ARRAY['E11.65'], 'Type 2 DM with hyperglycemia', ARRAY['99213','83036'], 'Office visit + HbA1c', CURRENT_DATE - 5, NOW() - INTERVAL '14 hours', 90.00, 'approved', 15, 'auto_approve'),
  ('CLM-2026-00428', 'Specialty Hospital', v_insurer_id, 'Adel Smadi', '9800214567', '1980-11-22', 'M', ARRAY['J45.20'], 'Mild intermittent asthma, uncomplicated', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 3, NOW() - INTERVAL '5 hours', 60.00, 'approved', 5, 'auto_approve'),
  ('CLM-2026-00429', 'Farah Hospital', v_insurer_id, 'Nisreen Abbadi', '9960315678', '1996-07-09', 'F', ARRAY['N76.0'], 'Acute vaginitis', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 4, NOW() - INTERVAL '8 hours', 55.00, 'approved', 10, 'auto_approve'),
  ('CLM-2026-00430', 'Jordan Hospital', v_insurer_id, 'Raed Hamdan', '9880416789', '1988-02-14', 'M', ARRAY['M54.5'], 'Low back pain, unspecified', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 7, NOW() - INTERVAL '2 days', 65.00, 'approved', 18, 'auto_approve'),
  ('CLM-2026-00431', 'Al-Khalidi Medical Center', v_insurer_id, 'Hala Awamleh', '9940517890', '1994-10-03', 'F', ARRAY['Z12.31'], 'Encounter for screening mammogram', ARRAY['77067'], 'Screening mammography, bilateral', CURRENT_DATE - 9, NOW() - INTERVAL '3 days', 120.00, 'approved', 7, 'auto_approve'),
  ('CLM-2026-00432', 'Istiklal Hospital', v_insurer_id, 'Mutaz Zu''bi', '9820618901', '1982-06-28', 'M', ARRAY['R10.9'], 'Unspecified abdominal pain', ARRAY['99213','76700'], 'Office visit + abdominal ultrasound', CURRENT_DATE - 8, NOW() - INTERVAL '2 days', 175.00, 'approved', 22, 'auto_approve'),
  ('CLM-2026-00433', 'Amman Surgical Hospital', v_insurer_id, 'Hadeel Bdour', '9970719012', '1997-03-11', 'F', ARRAY['Z23'], 'Encounter for immunization', ARRAY['90471','90651'], 'Immunization admin + HPV vaccine', CURRENT_DATE - 1, NOW() - INTERVAL '1 hour', 80.00, 'pending', 4, 'auto_approve'),
  ('CLM-2026-00434', 'Jordan Hospital', v_insurer_id, 'Nidal Fakhouri', '9760820123', '1976-09-19', 'M', ARRAY['I10','E78.5'], 'Hypertension + Hyperlipidemia', ARRAY['99214','80061'], 'Office visit (level 4) + lipid panel', CURRENT_DATE - 3, NOW() - INTERVAL '6 hours', 135.00, 'pending', 20, 'auto_approve'),
  ('CLM-2026-00435', 'Ibn Al-Haytham Hospital', v_insurer_id, 'Sawsan Malkawi', '9900921234', '1990-12-01', 'F', ARRAY['H52.13'], 'Myopia, bilateral', ARRAY['92014'], 'Ophthalmological exam, comprehensive', CURRENT_DATE - 5, NOW() - INTERVAL '1 day', 70.00, 'approved', 6, 'auto_approve'),
  ('CLM-2026-00436', 'Specialty Hospital', v_insurer_id, 'Ghaith Masarweh', '9841022345', '1984-05-07', 'M', ARRAY['K21.0'], 'GERD with esophagitis', ARRAY['99213'], 'Office visit, established patient (level 3)', CURRENT_DATE - 6, NOW() - INTERVAL '1 day', 60.00, 'pending', 14, 'auto_approve'),
  ('CLM-2026-00437', 'Farah Hospital', v_insurer_id, 'Muna Tawalbeh', '9921123456', '1992-08-16', 'F', ARRAY['R51.9'], 'Headache, unspecified', ARRAY['99212'], 'Office visit, established patient (level 2)', CURRENT_DATE - 2, NOW() - INTERVAL '3 hours', 40.00, 'pending', 9, 'auto_approve'),
  ('CLM-2026-00438', 'Al-Khalidi Medical Center', v_insurer_id, 'Aws Batayneh', '9781224567', '1978-04-22', 'M', ARRAY['E11.9'], 'Type 2 DM without complications', ARRAY['99213','82947'], 'Office visit + glucose test', CURRENT_DATE - 4, NOW() - INTERVAL '7 hours', 78.00, 'pending', 11, 'auto_approve'),
  ('CLM-2026-00439', 'Jordan Hospital', v_insurer_id, 'Ruba Shishani', '9950125678', '1995-06-30', 'F', ARRAY['J02.9'], 'Acute pharyngitis, unspecified', ARRAY['99212','87880'], 'Office visit + strep test', CURRENT_DATE - 1, NOW() - INTERVAL '2 hours', 55.00, 'pending', 7, 'auto_approve'),
  ('CLM-2026-00440', 'Istiklal Hospital', v_insurer_id, 'Moath Ababneh', '9860226789', '1986-10-13', 'M', ARRAY['M25.561'], 'Pain in right knee', ARRAY['99213','73562'], 'Office visit + knee X-ray', CURRENT_DATE - 3, NOW() - INTERVAL '5 hours', 130.00, 'rejected', 25, 'auto_approve');

  -- Update the rejected one with a reason
  UPDATE insurer_claims SET decision_reason = 'Duplicate claim — same service covered under CLM-2026-00218 on 2026-04-02.', decided_at = NOW() - INTERVAL '2 days' WHERE claim_number = 'CLM-2026-00440';

  -- ============================================================
  -- FLAGS for high-risk claims
  -- ============================================================

  -- Claim 1 flags (CLM-2026-00401 — inflated office visit, score 94)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00401'),
   'amount_anomaly', 'high', 'Amount 3.2x network median',
   'This clinic billed 385 JOD for CPT 99213 (standard office visit). The network median across 47 contracted clinics is 120 JOD. The top 5% threshold is 180 JOD. This claim exceeds the 99th percentile.',
   '{"network_median": 120, "claim_amount": 385, "multiplier": 3.21, "percentile": 99, "top_5_pct": 180}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00401'),
   'provider_pattern', 'medium', 'Clinic billing 42% above average this month',
   'Jordan Hospital has submitted 28 claims this month with an average amount of 245 JOD, compared to the network average of 172 JOD for the same procedure mix. This is a 42% premium over comparable clinics.',
   '{"clinic_avg": 245, "network_avg": 172, "premium_pct": 42, "claims_this_month": 28}'::jsonb);

  -- Claim 2 flags (CLM-2026-00402 — duplicate MRI, score 88)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00402'),
   'duplicate_service', 'high', 'Same MRI procedure 11 days ago',
   'Patient Fatima Al-Masri received CPT 72148 (MRI lumbar spine) at Jordan Hospital on 2026-04-14. This current claim is from Al-Khalidi Medical Center on 2026-04-25. Possible duplicate billing or unreported doctor-shopping.',
   '{"previous_claim": "CLM-2026-00218", "previous_clinic": "Jordan Hospital", "previous_date": "2026-04-14", "days_between": 11, "same_procedure": true}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00402'),
   'amount_anomaly', 'medium', 'Amount above 75th percentile',
   'MRI lumbar spine (72148) billed at 420 JOD. Network median is 310 JOD, 75th percentile is 380 JOD. Amount is 35% above median.',
   '{"network_median": 310, "claim_amount": 420, "p75": 380, "premium_pct": 35}'::jsonb);

  -- Claim 3 flags (CLM-2026-00403 — code mismatch, score 96)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00403'),
   'code_mismatch', 'high', 'Diagnosis-procedure mismatch',
   'Diagnosis J06.9 (acute upper respiratory infection) does not clinically justify CPT 43239 (upper GI endoscopy with biopsy). An endoscopy is a gastrointestinal procedure, not a respiratory treatment. This combination has a 0.3% occurrence rate in our claims database.',
   '{"diagnosis": "J06.9", "procedure": "43239", "expected_procedures": ["99213", "99212", "94640"], "occurrence_rate": 0.003}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00403'),
   'amount_anomaly', 'high', 'High-cost procedure for minor diagnosis',
   'A 1,850 JOD endoscopy procedure was billed against a common cold diagnosis (J06.9). Average treatment cost for J06.9 across the network is 85 JOD.',
   '{"avg_cost_for_diagnosis": 85, "claim_amount": 1850, "multiplier": 21.8}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00403'),
   'missing_documentation', 'medium', 'No referral documentation',
   'Endoscopy procedures (CPT 43239) require a specialist referral letter per policy section 4.2.1. No referral document was attached to this claim submission.',
   '{"required_doc": "specialist_referral", "policy_section": "4.2.1"}'::jsonb);

  -- Claim 4 flags (CLM-2026-00404 — pre-auth missing, score 82)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00404'),
   'pre_auth_missing', 'high', 'Pre-authorization required but not obtained',
   'Laparoscopic cholecystectomy (CPT 47562) requires pre-authorization per policy. No pre-auth number was provided with this claim. Without valid pre-authorization, this procedure is not covered under the standard plan.',
   '{"procedure": "47562", "requires_pre_auth": true, "pre_auth_number": null, "policy_section": "3.1.4"}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00404'),
   'amount_anomaly', 'medium', 'Amount at 90th percentile',
   'Cholecystectomy billed at 4,200 JOD. Network median is 3,100 JOD, 90th percentile is 4,000 JOD.',
   '{"network_median": 3100, "claim_amount": 4200, "p90": 4000, "premium_pct": 35}'::jsonb);

  -- Claim 5 flags (CLM-2026-00405 — provider pattern, score 78)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00405'),
   'provider_pattern', 'high', 'Unusual surgical volume spike',
   'Amman Surgical Hospital submitted 12 arthroscopy claims in the past 30 days, compared to a 6-month average of 4 per month. This represents a 200% increase. Volume spikes of this magnitude are flagged for pattern review.',
   '{"current_month_volume": 12, "avg_monthly_volume": 4, "increase_pct": 200, "procedure": "29881"}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00405'),
   'amount_anomaly', 'medium', 'Above network average for procedure',
   'Knee arthroscopy billed at 5,600 JOD. Network median is 4,200 JOD. Amount is 33% above median.',
   '{"network_median": 4200, "claim_amount": 5600, "premium_pct": 33}'::jsonb);

  -- Claim 6 flags (CLM-2026-00406 — coverage limit, score 75)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00406'),
   'coverage_limit', 'high', 'Patient near annual coverage limit',
   'Patient Rania Haddad has utilized 42,200 JOD of her 50,000 JOD annual coverage limit. This 7,800 JOD claim would bring total utilization to 100%. Remaining coverage after this claim would be 0 JOD.',
   '{"annual_limit": 50000, "utilized": 42200, "this_claim": 7800, "remaining_after": 0, "utilization_pct": 100}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00406'),
   'missing_documentation', 'medium', 'Pathology report not attached',
   'Partial mastectomy claims (CPT 19301) require a pathology report confirming diagnosis. No pathology report was included in this submission.',
   '{"required_doc": "pathology_report", "policy_section": "5.3.2"}'::jsonb);

  -- Claim 7 flags (CLM-2026-00407 — duplicate + amount, score 91)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00407'),
   'duplicate_service', 'high', 'Same endoscopy 18 days ago at different clinic',
   'Patient Khaled Abudeya received CPT 43239 (upper GI endoscopy) at Specialty Hospital on 2026-04-01. This current claim from Farah Hospital is 18 days later. Repeat endoscopy within 30 days requires clinical justification per policy 4.5.1.',
   '{"previous_claim": "CLM-2026-00312", "previous_clinic": "Specialty Hospital", "previous_date": "2026-04-01", "days_between": 18}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00407'),
   'amount_anomaly', 'high', 'Amount 2.6x network median',
   'Upper GI endoscopy with biopsy (43239) billed at 2,100 JOD. Network median is 810 JOD. This claim is at the 98th percentile.',
   '{"network_median": 810, "claim_amount": 2100, "multiplier": 2.59, "percentile": 98}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00407'),
   'provider_pattern', 'medium', 'Farah Hospital flagged in 3 claims this week',
   'This is the 3rd claim from Farah Hospital flagged for risk this week. Two previous claims (CLM-2026-00409, CLM-2026-00421) also triggered anomaly flags.',
   '{"flagged_claims_this_week": 3, "clinic": "Farah Hospital"}'::jsonb);

  -- Claim 8 flags (CLM-2026-00408 — missing docs, score 72)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00408'),
   'missing_documentation', 'high', 'Lab results not attached',
   'HbA1c test (CPT 83036) was billed but no lab results document was attached to the claim. Lab result documentation is required per policy section 6.1.3 for all diagnostic tests.',
   '{"required_doc": "lab_results", "test": "HbA1c", "policy_section": "6.1.3"}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00408'),
   'provider_pattern', 'low', 'Slightly above average billing frequency',
   'Jordan Hospital has billed 15% more HbA1c tests this quarter compared to the network average. This is within normal variance but noted for tracking.',
   '{"clinic_volume": 34, "network_avg_volume": 29, "premium_pct": 15}'::jsonb);

  -- Claim 9 flags (CLM-2026-00409 — unusual volume, score 73)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00409'),
   'provider_pattern', 'high', 'Farah Hospital: 3x normal nebulizer volume',
   'Farah Hospital submitted 18 nebulizer treatment claims (CPT 94640) this month, compared to a network average of 6 per clinic. This 200% increase coincides with the allergy season but exceeds the seasonal adjustment threshold.',
   '{"clinic_volume": 18, "network_avg": 6, "increase_pct": 200, "seasonal_threshold": 10}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00409'),
   'amount_anomaly', 'medium', 'Combined billing above expected',
   'Total billed for nebulizer + bronchospasm eval is 280 JOD. Expected combined cost is 180 JOD. Premium of 56%.',
   '{"expected_combined": 180, "claim_amount": 280, "premium_pct": 56}'::jsonb);

  -- Claim 10 flags (CLM-2026-00410 — cardiac, score 71)
  INSERT INTO claim_flags (claim_id, flag_type, severity, title, explanation, evidence) VALUES
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00410'),
   'pre_auth_missing', 'high', 'Cardiac catheterization requires pre-authorization',
   'Left heart catheterization (CPT 93458) is classified as a high-cost procedure requiring pre-authorization under all standard plans. No pre-auth number was submitted. Policy section 3.1.4.',
   '{"procedure": "93458", "category": "high_cost_cardiac", "requires_pre_auth": true, "policy_section": "3.1.4"}'::jsonb),
  ((SELECT id FROM insurer_claims WHERE claim_number = 'CLM-2026-00410'),
   'coverage_limit', 'medium', 'Patient approaching annual cardiac sub-limit',
   'Patient Samir Bataineh has used 18,500 JOD of his 25,000 JOD cardiac sub-limit. This 6,500 JOD claim would bring utilization to 100%.',
   '{"cardiac_sublimit": 25000, "utilized": 18500, "this_claim": 6500, "remaining_after": 0}'::jsonb);

  RAISE NOTICE 'Seeded 40 claims and flags for insurer %', v_insurer_id;
END $$;
