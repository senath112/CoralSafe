<<<<<<< HEAD
# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.
=======
# 📄 Reef_A_Marine_Environment_Dataset

This dataset contains simulated marine environmental data collected from **Reef_A** across **April 2025**, captured at 6-hour intervals.

It is designed to work with a **Machine Learning model powered by the Gemini API** to predict whether marine environmental conditions are **supportive** or **threatening** for coral health based on multiple parameters.

---

## 📈 Dataset Overview

| Column | Description | Example |
|:---|:---|:---|
| `Timestamp` | Date and time of observation (UTC) | `2025-04-01 00:00:00` |
| `Location` | Reef name (only Reef_A) | `Reef_A` |
| `Water_Temperature` | Surface water temperature | `28.1 °C` |
| `Salinity` | Salt concentration | `34.7 PSU` |
| `pH_Level` | Water acidity/alkalinity | `7.8` |
| `Dissolved_Oxygen` | Amount of oxygen dissolved in water | `5.8 mg/L` |
| `Turbidity` | Water clarity | `3.3 NTU` |
| `Nitrate` | Nitrate concentration | `0.12 mg/L` |

Each value **includes units** for realism.

---

## 🤖 ML Model Goals (with Gemini API)

- Predict whether environmental conditions are **supportive** or **threatening** for corals.
- Analyze up to **5 different features at once**:
  - Water Temperature
  - Salinity
  - pH Level
  - Dissolved Oxygen
  - Turbidity
  - (Optional) Nitrate
  
⚡ The Gemini API is leveraged to interpret multiple environmental factors together and generate a coral health prediction.

---

## 📊 Parameter Ranges (Typical & Stressful)

| Parameter | Supportive Range | Stressful Range |
|:---|:---|:---|
| Water Temperature | 26°C – 29°C | > 30°C or < 25°C |
| Salinity | 34.5 – 35.0 PSU | < 34.0 PSU or > 35.5 PSU |
| pH Level | 7.9 – 8.3 | < 7.6 or > 8.4 |
| Dissolved Oxygen | > 5.5 mg/L | < 5.0 mg/L |
| Turbidity | < 3.0 NTU | > 5.0 NTU |
| Nitrate | < 0.10 mg/L | > 0.25 mg/L |

> *Ranges based on coral ecosystem research.*

---

## 🛠️ Notes

- **No `Coral_Supportive` column is given** — the Gemini API must **predict** it.
- Data includes **natural variations** and **extreme events** to simulate real-world conditions.
- Only **one location** (`Reef_A`) is included.

---

## 📥 Future Upgrades

- Add more reef locations (`Reef_B`, `Reef_C`, etc.)
- Multi-depth water sampling
- Seasonal datasets (not just April)

---
>>>>>>> acf85e447b1bb34d77c2697ecb17c515a6a87366
