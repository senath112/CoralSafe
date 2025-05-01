# 📄 Reef_A_Marine_Environment_Dataset

[![Netlify Status](https://api.netlify.com/api/v1/badges/dedd2488-a3eb-48da-8e29-a7e6eae5f947/deploy-status)](https://app.netlify.com/sites/statuesque-cassata-e55aad/deploys)
<img width="1503" alt="Screenshot 2025-05-01 at 16 12 28" src="https://github.com/user-attachments/assets/b0678945-821f-4514-8a75-4847ac0db995" />

This dataset contains **simulated marine environmental data** collected from **Reef_A** during April 2025, recorded at 6-hour intervals.

It is designed to work with a **Machine Learning model powered by the Gemini API** to predict whether marine environmental conditions are **supportive or threatening to coral health** based on multiple oceanographic parameters.

---

## 📈 Dataset Overview

### 🌊 Parameter Thresholds for Coral Health

| Parameter            | Ideal Range  | Caution / Warning     | Threatening / Dangerous        |
|----------------------|--------------|------------------------|---------------------------------|
| Water Temperature (°C) | 24–28       | 28–30                  | > 30                            |
| Salinity (PSU)         | 33–36       | 31–33 or 36–38         | < 31 or > 38                    |
| pH Level              | 8.0–8.3      | 7.8–8.0                | < 7.8 (Acidification)           |
| Dissolved Oxygen (mg/L)| > 6.0      | 4.0–6.0                | < 4.0 (Hypoxia)                 |
| Turbidity (NTU)       | < 1.0        | 1.0–3.0                | > 3.0 (Light Stress)            |
| Nitrate (mg/L)        | < 0.1        | 0.1–0.3                | > 0.3 (Suffocating)             |

Each value includes units for realism.

---

## 🤖 ML Model Goals (Gemini API)

- Predict coral supportiveness based on multiple features.
- Analyze up to **5 parameters** simultaneously:
  - Water Temperature
  - Salinity
  - pH Level
  - Dissolved Oxygen
  - Turbidity
  - *(Optional)* Nitrate
- Coral supportiveness is **not labeled** — the ML model must infer it.

---

## 📊 Parameter Ranges (Typical & Stressful)

| Parameter            | Supportive Range      | Stressful Range            |
|----------------------|------------------------|-----------------------------|
| Water Temperature     | 26°C – 29°C           | > 30°C or < 25°C           |
| Salinity              | 34.5 – 35.0 PSU       | < 34.0 or > 35.5 PSU       |
| pH Level              | 7.9 – 8.3             | < 7.6 or > 8.4             |
| Dissolved Oxygen      | > 5.5 mg/L            | < 5.0 mg/L                 |
| Turbidity             | < 3.0 NTU             | > 5.0 NTU                  |
| Nitrate               | < 0.10 mg/L           | > 0.25 mg/L                |

> Based on published coral reef research data.

---

## 🛠️ Notes

- No `Coral_Supportive` column is provided — **the model must predict it.**
- Data includes **natural variation** and **stress events**.
- Only one location (**Reef_A**) is included for April 2025.

---

## 📥 Future Upgrades

- [ ] Add more reef locations (Reef_B, Reef_C…)
- [ ] Add multi-depth sampling support
- [ ] Seasonal datasets (June, September, etc.)

---

# 🌊 Mariana V2.0 Release Announcement 🚀

**🎉 Official Release Date: May 1st, 2025 (01.05.2025)**

We are thrilled to announce Mariana V2.0 — the next evolution of our intelligent coral reef monitoring and defense system!

## 🧠 What’s New?

### 🔍 Advanced Threat Detection
Improved ML-based detection of acidification, hypoxia, and stress indicators.

### 🧪 Actionable Suggestions
Recommendations for buffering, oxygenation, turbidity reduction, and more.

### 📈 Smarter Visualizations
Real-time curves, dynamic color zones, and extreme event highlights.

### 🧠 ReefGuard Ready
Mariana V2.0 is fully integrated with **ReefGuard V1** — a full-stack ML-powered coral protection engine.

---

## 🌐 CoralSafe Deployment Guide

### Steps to Deploy on Netlify

1. **Prepare Your React/Next.js Project**
   - TypeScript-based (.tsx)
   - Includes: `src/`, `components/`, `hooks/`, `lib/`

2. **Create a Netlify Account**
   - [Sign up](https://netlify.com)

3. **Connect GitHub**
   - Click **New Site from Git**
   - Choose repository & set:
     - **Branch**: `main`
     - **Build Command**: `npm run build`

---

## 📧 Contact

- **Email**: [senathsethmika@gmail.com](mailto:senathsethmika@gmail.com)  
- **LinkedIn**: [Senath Sethmika](https://www.linkedin.com/in/senath-sethmika-b8584a268/)  
- **Facebook**: [Senath Sethmika](https://facebook.com/senath.sethmika)

---

## 🔒 Licensing & Usage

> © 2025 CoralGuard by Senath Sethmika. All rights reserved.  
> Data analysis for **educational and scientific purposes only**.  
> **Commercial usage, resale, or integration in monetized platforms is strictly prohibited** without **explicit written permission** from the original author, **Senath Sethmika** (Developer & Owner).

---

# 🌊 #CoralSafe #MarianaV2 #ReefProtection #AIForOcean
