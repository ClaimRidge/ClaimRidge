// Insurance companies / payers operating in Jordan and the wider MENA/GCC region.
// `providerIdFormat` captures the expected provider/facility identifier format
// some payers require on claim submissions — shown as a helper hint in the UI
// so billers don't submit in the wrong format.

export interface Payer {
  name: string;              // English name
  nameAr: string;            // Arabic name
  country: string;           // Primary country of operation
  providerIdFormat?: string; // Expected provider ID format (hint/example)
  code?: string;             // Unique payer code for PDF generation routing
}

export const PAYERS: Payer[] = [
  // --- Jordan ---
  {
    name: "Jordan Insurance Company",
    nameAr: "شركة التأمين الأردنية",
    country: "Jordan",
    providerIdFormat: "JIC-PRV-XXXXXX (6-digit provider code)",
    code: "JORDAN_INSURANCE",
  },
  {
    name: "Arab Orient Insurance (GIG Jordan)",
    nameAr: "الشرق العربي للتأمين",
    country: "Jordan",
    providerIdFormat: "AO/XXXX-JO (alphanumeric, 4 digits + country code)",
    code: "GIG_JORDAN",
  },
  {
    name: "Arab Life & Accidents Insurance",
    nameAr: "العربية للتأمين على الحياة والحوادث",
    country: "Jordan",
    providerIdFormat: "ALA-XXXXX (5-digit facility code)",
    code: "ALAI",
  },
  {
    name: "Islamic Insurance Company",
    nameAr: "شركة التأمين الإسلامية",
    country: "Jordan",
    providerIdFormat: "IIC-XXXXXX (6-digit Takaful provider code)",
    code: "ISLAMIC_INSURANCE",
  },
  {
    name: "Al Nisr Al Arabi Insurance",
    nameAr: "النسر العربي للتأمين",
    country: "Jordan",
    providerIdFormat: "NISR-XXXX (4-digit network code)",
    code: "AL_NISR",
  },
  {
    name: "Arab Assurers Insurance",
    nameAr: "المؤمنون العرب",
    country: "Jordan",
    providerIdFormat: "AA-XXXXXX (6-digit provider code)",
    code: "ARAB_ASSURERS",
  },
  {
    name: "Médical Assurance (MedNet Jordan)",
    nameAr: "ميدنت الأردن",
    country: "Jordan",
    providerIdFormat: "MN-JO-XXXXX (5-digit MedNet facility ID)",
    code: "MEDNET",
  },
  {
    name: "MetLife Jordan",
    nameAr: "ميتلايف الأردن",
    country: "Jordan",
    providerIdFormat: "MET-JO-XXXXXX (6-digit provider code)",
  },
  {
    name: "Jordan French Insurance",
    nameAr: "الأردنية الفرنسية للتأمين",
    country: "Jordan",
    providerIdFormat: "JFI-XXXXX (5-digit facility code)",
  },
  {
    name: "Jerusalem Insurance Company",
    nameAr: "شركة تأمين القدس",
    country: "Jordan",
    providerIdFormat: "JER-XXXXX (5-digit provider code)",
  },
  {
    name: "Euro Arab Insurance Group",
    nameAr: "المجموعة العربية الأوروبية للتأمين",
    country: "Jordan",
    providerIdFormat: "EAG-XXXX (4-digit provider code)",
  },
  {
    name: "Philadelphia Insurance",
    nameAr: "فيلادلفيا للتأمين",
    country: "Jordan",
    providerIdFormat: "PHIL-XXXXX (5-digit facility code)",
  },
  {
    name: "Delta Insurance",
    nameAr: "دلتا للتأمين",
    country: "Jordan",
    providerIdFormat: "DLT-XXXXX (5-digit provider code)",
  },
  {
    name: "Middle East Insurance",
    nameAr: "الشرق الأوسط للتأمين",
    country: "Jordan",
    providerIdFormat: "MEI-XXXXXX (6-digit provider code)",
    code: "MIDDLE_EAST_INS",
  },
  {
    name: "National Ahlia Insurance",
    nameAr: "الأهلية الوطنية للتأمين",
    country: "Jordan",
    providerIdFormat: "NAI-XXXX (4-digit network code)",
  },
  {
    name: "Solidarity First Insurance",
    nameAr: "التكافل الأولى للتأمين",
    country: "Jordan",
    providerIdFormat: "SOL-XXXXX (5-digit Takaful code)",
  },
  {
    name: "First Insurance",
    nameAr: "الأولى للتأمين",
    country: "Jordan",
    providerIdFormat: "FIN-XXXXX (5-digit facility code)",
  },
  {
    name: "Holy Land Insurance",
    nameAr: "الأرض المقدسة للتأمين",
    country: "Jordan",
    providerIdFormat: "HLI-XXXX (4-digit provider code)",
  },
  {
    name: "General Arabia Insurance",
    nameAr: "العربية العامة للتأمين",
    country: "Jordan",
    providerIdFormat: "GAI-XXXXXX (6-digit provider code)",
  },
  {
    name: "Royal Jordanian Insurance",
    nameAr: "الملكية الأردنية للتأمين",
    country: "Jordan",
    providerIdFormat: "RJI-XXXXX (5-digit facility code)",
  },
  {
    name: "Al-Manara Insurance",
    nameAr: "المنارة للتأمين",
    country: "Jordan",
    providerIdFormat: "MAN-XXXX (4-digit provider code)",
  },

  // --- UAE ---
  {
    name: "Daman — National Health Insurance",
    nameAr: "ضمان — الوطنية للتأمين الصحي",
    country: "UAE",
    providerIdFormat: "DAMAN-XXXXXX (6-digit DHA/HAAD provider ID)",
  },
  {
    name: "AXA Gulf",
    nameAr: "أكسا الخليج",
    country: "UAE",
    providerIdFormat: "AXA-GULF-XXXXXXX (7-digit network code)",
  },
  {
    name: "Oman Insurance Company (Sukoon)",
    nameAr: "عمان للتأمين — سكون",
    country: "UAE",
    providerIdFormat: "OIC-XXXXX (5-digit provider code)",
  },
  {
    name: "Orient Insurance PJSC",
    nameAr: "الشرق للتأمين",
    country: "UAE",
    providerIdFormat: "ORNT-XXXXXX (6-digit provider code)",
  },
  {
    name: "Abu Dhabi National Insurance (ADNIC)",
    nameAr: "أدنيك — أبوظبي الوطنية للتأمين",
    country: "UAE",
    providerIdFormat: "ADNIC-XXXXXX (6-digit HAAD provider ID)",
  },
  {
    name: "Dubai Insurance Company",
    nameAr: "دبي للتأمين",
    country: "UAE",
    providerIdFormat: "DIC-XXXXX (5-digit DHA provider code)",
  },
  {
    name: "NextCare (Allianz Partners)",
    nameAr: "نكست كير",
    country: "UAE",
    providerIdFormat: "NC-XXXXXXX (7-digit NextCare network ID)",
    code: "NEXTCARE",
  },
  {
    name: "NAS Administration Services",
    nameAr: "ناس لإدارة الخدمات",
    country: "UAE",
    providerIdFormat: "NAS-XXXXX (5-digit provider code)",
  },
  {
    name: "Neuron LLC (by Sukoon)",
    nameAr: "نيورون",
    country: "UAE",
    providerIdFormat: "NEU-XXXXXX (6-digit provider code)",
  },
  {
    name: "Emirates Insurance Company",
    nameAr: "الإمارات للتأمين",
    country: "UAE",
    providerIdFormat: "EIC-XXXXX (5-digit provider code)",
  },
  {
    name: "Thiqa (Abu Dhabi)",
    nameAr: "ثقة",
    country: "UAE",
    providerIdFormat: "THIQA-XXXXXX (6-digit HAAD provider ID)",
  },

  // --- Saudi Arabia ---
  {
    name: "Bupa Arabia",
    nameAr: "بوبا العربية",
    country: "Saudi Arabia",
    providerIdFormat: "BUPA-KSA-XXXXXXX (7-digit CCHI provider code)",
  },
  {
    name: "Tawuniya (The Company for Cooperative Insurance)",
    nameAr: "التعاونية للتأمين",
    country: "Saudi Arabia",
    providerIdFormat: "TAW-XXXXXXX (7-digit CCHI provider code)",
  },
  {
    name: "MedGulf",
    nameAr: "ميدغلف",
    country: "Saudi Arabia",
    providerIdFormat: "MGF-XXXXXX (6-digit provider code)",
  },
  {
    name: "Malath Cooperative Insurance",
    nameAr: "ملاذ للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "MLT-XXXXXX (6-digit CCHI code)",
  },
  {
    name: "Al Rajhi Takaful",
    nameAr: "الراجحي تكافل",
    country: "Saudi Arabia",
    providerIdFormat: "ART-XXXXXX (6-digit Takaful provider code)",
  },
  {
    name: "AXA Cooperative Insurance",
    nameAr: "أكسا التعاونية",
    country: "Saudi Arabia",
    providerIdFormat: "AXA-KSA-XXXXXX (6-digit CCHI provider code)",
  },
  {
    name: "Wataniya Insurance",
    nameAr: "الوطنية للتأمين",
    country: "Saudi Arabia",
    providerIdFormat: "WAT-XXXXX (5-digit provider code)",
  },
  {
    name: "Walaa Cooperative Insurance",
    nameAr: "ولاء للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "WLA-XXXXX (5-digit CCHI code)",
  },
  {
    name: "Salama Cooperative Insurance",
    nameAr: "سلامة للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "SLM-XXXXX (5-digit provider code)",
  },
  {
    name: "SAICO (Saudi Arabian Insurance)",
    nameAr: "سايكو — السعودية العربية للتأمين",
    country: "Saudi Arabia",
    providerIdFormat: "SAICO-XXXXX (5-digit provider code)",
  },
  {
    name: "Al Etihad Cooperative Insurance",
    nameAr: "الاتحاد التجاري للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "ETH-XXXXX (5-digit provider code)",
  },
  {
    name: "NGI — Gulf Union National",
    nameAr: "الخليج المتحد الأهلية",
    country: "Saudi Arabia",
    providerIdFormat: "NGI-XXXXXX (6-digit provider code)",
  },
  {
    name: "Arabian Shield Cooperative Insurance",
    nameAr: "الدرع العربي للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "ASH-XXXXX (5-digit provider code)",
  },
  {
    name: "Buruj Cooperative Insurance",
    nameAr: "بروج للتأمين التعاوني",
    country: "Saudi Arabia",
    providerIdFormat: "BRJ-XXXXX (5-digit provider code)",
  },

  // --- Qatar ---
  {
    name: "Qatar Insurance Company (QIC)",
    nameAr: "قطر للتأمين",
    country: "Qatar",
    providerIdFormat: "QIC-XXXXXX (6-digit provider code)",
  },
  {
    name: "Doha Insurance Group",
    nameAr: "مجموعة الدوحة للتأمين",
    country: "Qatar",
    providerIdFormat: "DIG-XXXXX (5-digit provider code)",
  },
  {
    name: "Qatar General Insurance",
    nameAr: "قطر العامة للتأمين",
    country: "Qatar",
    providerIdFormat: "QGI-XXXXX (5-digit provider code)",
  },
  {
    name: "Seib Insurance & Reinsurance",
    nameAr: "السيب للتأمين وإعادة التأمين",
    country: "Qatar",
    providerIdFormat: "SEIB-XXXXX (5-digit provider code)",
  },

  // --- Kuwait ---
  {
    name: "Gulf Insurance Group (GIG Kuwait)",
    nameAr: "مجموعة الخليج للتأمين",
    country: "Kuwait",
    providerIdFormat: "GIG-KW-XXXXX (5-digit provider code)",
  },
  {
    name: "Warba Insurance",
    nameAr: "وربة للتأمين",
    country: "Kuwait",
    providerIdFormat: "WRB-XXXXX (5-digit provider code)",
  },
  {
    name: "Kuwait Insurance Company",
    nameAr: "الكويت للتأمين",
    country: "Kuwait",
    providerIdFormat: "KIC-XXXXX (5-digit provider code)",
  },
  {
    name: "Al Ahleia Insurance",
    nameAr: "الأهلية للتأمين",
    country: "Kuwait",
    providerIdFormat: "AHL-XXXXX (5-digit provider code)",
  },

  // --- Bahrain ---
  {
    name: "Bahrain National Insurance (bni)",
    nameAr: "البحرين الوطنية للتأمين",
    country: "Bahrain",
    providerIdFormat: "BNI-XXXXX (5-digit provider code)",
  },
  {
    name: "Solidarity Bahrain",
    nameAr: "سوليدرتي البحرين",
    country: "Bahrain",
    providerIdFormat: "SOL-BH-XXXXX (5-digit provider code)",
  },
  {
    name: "GIG Bahrain",
    nameAr: "مجموعة الخليج للتأمين — البحرين",
    country: "Bahrain",
    providerIdFormat: "GIG-BH-XXXXX (5-digit provider code)",
  },

  // --- Oman ---
  {
    name: "Oman United Insurance",
    nameAr: "عُمان المتحدة للتأمين",
    country: "Oman",
    providerIdFormat: "OUI-XXXXX (5-digit provider code)",
  },
  {
    name: "National Life & General Insurance (NLGIC)",
    nameAr: "الوطنية للحياة والتأمين العام",
    country: "Oman",
    providerIdFormat: "NLGIC-XXXXX (5-digit provider code)",
  },
  {
    name: "Dhofar Insurance",
    nameAr: "ظفار للتأمين",
    country: "Oman",
    providerIdFormat: "DHO-XXXXX (5-digit provider code)",
  },

  // --- Egypt ---
  {
    name: "Misr Insurance Holding Company",
    nameAr: "شركة مصر القابضة للتأمين",
    country: "Egypt",
    providerIdFormat: "MISR-XXXXXX (6-digit provider code)",
  },
  {
    name: "Allianz Egypt",
    nameAr: "أليانز مصر",
    country: "Egypt",
    providerIdFormat: "ALZ-EG-XXXXX (5-digit provider code)",
  },
  {
    name: "AXA Egypt",
    nameAr: "أكسا مصر",
    country: "Egypt",
    providerIdFormat: "AXA-EG-XXXXX (5-digit provider code)",
  },
  {
    name: "GIG Egypt",
    nameAr: "مجموعة الخليج للتأمين — مصر",
    country: "Egypt",
    providerIdFormat: "GIG-EG-XXXXX (5-digit provider code)",
  },
  {
    name: "Bupa Egypt",
    nameAr: "بوبا مصر",
    country: "Egypt",
    providerIdFormat: "BUPA-EG-XXXXXX (6-digit provider code)",
  },

  // --- Lebanon ---
  {
    name: "Bankers Assurance",
    nameAr: "بانكرز للتأمين",
    country: "Lebanon",
    providerIdFormat: "BA-XXXXX (5-digit provider code)",
  },
  {
    name: "Medgulf Lebanon",
    nameAr: "ميدغلف لبنان",
    country: "Lebanon",
    providerIdFormat: "MGF-LB-XXXXX (5-digit provider code)",
  },
  {
    name: "LIA Insurance",
    nameAr: "ليا للتأمين",
    country: "Lebanon",
    providerIdFormat: "LIA-XXXXX (5-digit provider code)",
  },

  // --- International / Regional TPAs ---
  {
    name: "MetLife MENA",
    nameAr: "ميتلايف الشرق الأوسط",
    country: "Regional",
    providerIdFormat: "MET-MENA-XXXXXXX (7-digit provider code)",
  },
  {
    name: "Allianz Care MENA",
    nameAr: "أليانز كير الشرق الأوسط",
    country: "Regional",
    providerIdFormat: "ALZ-XXXXXXX (7-digit network ID)",
  },
  {
    name: "Cigna MENA",
    nameAr: "سيغنا الشرق الأوسط",
    country: "Regional",
    providerIdFormat: "CIGNA-XXXXXXX (7-digit provider code)",
  },
  {
    name: "RSA Insurance (Royal & Sun Alliance)",
    nameAr: "آر إس إيه للتأمين",
    country: "Regional",
    providerIdFormat: "RSA-XXXXXX (6-digit provider code)",
  },
  {
    name: "GlobeMed",
    nameAr: "غلوب ميد",
    country: "Regional (TPA)",
    providerIdFormat: "GM-XXXXXXX (7-digit GlobeMed network ID)",
  },
  {
    name: "MedNet (Munich Re)",
    nameAr: "ميدنت",
    country: "Regional (TPA)",
    providerIdFormat: "MN-XXXXXXX (7-digit MedNet provider ID)",
    code: "MEDNET",
  },
  {
    name: "NextCare MENA",
    nameAr: "نكست كير الشرق الأوسط",
    country: "Regional (TPA)",
    providerIdFormat: "NC-XXXXXXX (7-digit NextCare network ID)",
    code: "NEXTCARE",
  },
  {
    name: "NAS Group",
    nameAr: "مجموعة ناس",
    country: "Regional (TPA)",
    providerIdFormat: "NAS-XXXXXX (6-digit provider code)",
  },
  {
    name: "Aetna International",
    nameAr: "آيتنا الدولية",
    country: "Regional",
    providerIdFormat: "AET-XXXXXXXX (8-digit international provider ID)",
  },
];
