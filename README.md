# 📄 Reef_A_Marine_Environment_Dataset
[![Netlify Status](https://api.netlify.com/api/v1/badges/dedd2488-a3eb-48da-8e29-a7e6eae5f947/deploy-status)](https://app.netlify.com/sites/statuesque-cassata-e55aad/deploys)
---
This dataset contains simulated marine environmental data collected from **Reef_A** across **April 2025**, captured at 6-hour intervals.

It is designed to work with a **Machine Learning model powered by the Gemini API** to predict whether marine environmental conditions are **supportive** or **threatening** for coral health based on multiple parameters.

---

## 📈 Dataset Overview

## 🌊 Parameter Thresholds for Coral Health

| Parameter           | Ideal Range       | Caution / Warning      | Threatening / Dangerous           |
|---------------------|-------------------|-------------------------|------------------------------------|
| **Water Temperature (°C)** | 24–28              | 28–30                  | > 30                               |
| **Salinity (PSU)**         | 33–36              | 31–33 or 36–38         | < 31 or > 38                       |
| **pH Level**               | 8.0–8.3            | 7.8–8.0                | < 7.8 (Acidification)              |
| **Dissolved Oxygen (mg/L)**| > 6.0              | 4.0–6.0                | < 4.0 (Hypoxia)                    |
| **Turbidity (NTU)**        | < 1.0              | 1.0–3.0                | > 3.0 (Light Stress)              |
| **Nitrate (mg/L)**         | < 0.1              | 0.1–0.3                | > 0.3 (Suffocating)                |
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

- **No `Coral_Supportive` column is given** — the ML Model must **predict** it.
- Data includes **natural variations** and **extreme events** to simulate real-world conditions.
- Only **one location** (`Reef_A`) is included.

---

## 📥 Future Upgrades

- Add more reef locations (`Reef_B`, `Reef_C`, etc.)
- Multi-depth water sampling
- Seasonal datasets (not just April)
---
# 🌊 Mariana V2.0 Release Announcement 🚀

We are excited to announce that **Mariana V2.0** — the next major release of our intelligent coral reef monitoring system — will be officially launched on **May 1st, 2025**! 🎉

## 🧠 What's New in Mariana V2.0?

- 🔍 **Advanced Threat Detection**  
  Now with improved AI/ML analysis to identify harmful environmental conditions more accurately.

- 🧪 **Actionable Suggestions**  
  Get tailored recommendations like buffering agents for acidification, oxygenation tips, and more.

- 📈 **Smarter Visualizations**  
  Realistic parameter curves and real-time changes for an immersive experience.

- 🧠 **ReefGuard Ready**  
  Mariana V2.0 prepares your system for integration with **ReefGuard** (V1) — our full-stack ML engine for predictive coral defense.

---

📅 **Release Date:**  
🗓️ **May 1st, 2025** (01.05)

Stay tuned, and thank you for being a part of the mission to protect our oceans! 🌍🐠

---
#CoralSafe #MarianaV2 #ReefProtection #AIForOcean
---
# CoralSafe Deployment Guide

This guide will help you deploy the CoralSafe application on **Netlify** and set up the **Gemini AI** API integration using the `.env` file.

## Steps to Deploy on Netlify

Follow these instructions to deploy your app to Netlify.

### 1. **Prepare Your Project for Deployment**

Before you deploy, ensure that your project is properly set up. You need to have:

- A **React (or Next.js)** project built with TypeScript (`.tsx` files).
- Your project includes all necessary files like `src/`, `components/`, `hooks/`, and `lib/` directories.

### 2. **Create a Netlify Account**

- Go to [Netlify](https://www.netlify.com/) and sign up or log in if you already have an account.

### 3. **Connect Your GitHub Repository to Netlify**

- After logging into Netlify, click the **New Site from Git** button.
- Select **GitHub** as the provider.
- Authorize Netlify to access your GitHub repositories.
- Choose the repository where your project is stored.

### 4. **Configure Build Settings**

In the build settings:
- **Branch to deploy**: Select the branch you want to deploy (usually `main` or `master`).
- **Build command**: Set this to:
  ```bash
  npm run build

## Contact Information

If you have any questions, feel free to reach out to me:
  - **Email**: [senathsethmika@gmail.com](mailto:senathsethmika@gmail.com)
  - **LinkedIn**: [Senath Sethmika](https://www.linkedin.com/in/senath-sethmika-b8584a268/)
  - **Facebook**: [Senath Sethmika](https://www.facebook.com/senath.sethmika/)
>>>>>>> acf85e447b1bb34d77c2697ecb17c515a6a87366
