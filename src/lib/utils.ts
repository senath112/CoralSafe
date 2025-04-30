import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import * as tf from '@tensorflow/tfjs'; // Ensure tfjs is imported

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface SensorData {
  waterTemperature: number;
  salinity: number;
  pHLevel: number;
  dissolvedOxygen: number;
  turbidity: number;
  nitrate: number;
}

interface Thresholds {
  temperatureIdeal: [number, number];
  temperatureCaution: [number, number];
  salinityIdeal: [number, number];
  salinityCaution: [number, number, number, number]; // For ranges like 31-33 or 36-38
  pHLevelIdeal: [number, number];
  pHLevelCaution: [number, number];
  dissolvedOxygenIdeal: number; // Lower bound
  dissolvedOxygenCaution: [number, number];
  turbidityIdeal: number; // Upper bound
  turbidityCaution: [number, number];
  nitrateIdeal: number; // Upper bound
  nitrateCaution: [number, number];
}

interface AnalysisOutput {
  isSuitable: boolean;
  summary: string;
  threateningFactors: {
    temperature: boolean;
    salinity: boolean;
    pHLevel: boolean;
    dissolvedOxygen: boolean;
    turbidity: boolean;
    nitrate: boolean;
  };
}


export const defineSensorDataThresholds = (): Thresholds => ({
  temperatureIdeal: [24, 28],
  temperatureCaution: [28, 30], // Above 30 is threatening
  salinityIdeal: [33, 36],
  salinityCaution: [31, 33, 36, 38], // Below 31 or Above 38 is threatening
  pHLevelIdeal: [8.0, 8.3],
  pHLevelCaution: [7.8, 8.0], // Below 7.8 is threatening
  dissolvedOxygenIdeal: 6.0, // Greater than 6.0
  dissolvedOxygenCaution: [4.0, 6.0], // Below 4.0 is threatening
  turbidityIdeal: 1.0, // Below 1.0
  turbidityCaution: [1.0, 3.0], // Above 3.0 is threatening
  nitrateIdeal: 0.1, // Less than 0.1
  nitrateCaution: [0.1, 0.3], // Above 0.3 is threatening
});

// Function to analyze sensor data against thresholds
export const analyzeSensorData = (data: SensorData, thresholds: Thresholds): AnalysisOutput => {
  let isSuitable = true;
  const issues: string[] = [];
  const threateningFactors = {
      temperature: false,
      salinity: false,
      pHLevel: false,
      dissolvedOxygen: false,
      turbidity: false,
      nitrate: false,
  };

  // Temperature Check
  if (data.waterTemperature < thresholds.temperatureIdeal[0] || data.waterTemperature > thresholds.temperatureCaution[1]) {
    isSuitable = false;
    issues.push(`Temperature (${data.waterTemperature}°C) is outside the ideal or caution range.`);
     threateningFactors.temperature = true;
  } else if (data.waterTemperature > thresholds.temperatureIdeal[1]) {
     // Still suitable overall if only in caution, but note it
     // issues.push(`Temperature (${data.waterTemperature}°C) is in the caution range.`);
     // We consider caution ranges as not making the whole system unsuitable immediately
     // but contribute to a lower suitability index.
  }


  // Salinity Check
  if (data.salinity < thresholds.salinityCaution[0] || data.salinity > thresholds.salinityCaution[3]) {
      isSuitable = false;
      issues.push(`Salinity (${data.salinity} PSU) is in a dangerous range.`);
      threateningFactors.salinity = true;
  } else if (
      (data.salinity >= thresholds.salinityCaution[0] && data.salinity < thresholds.salinityIdeal[0]) ||
      (data.salinity > thresholds.salinityIdeal[1] && data.salinity <= thresholds.salinityCaution[3])
  ) {
      // issues.push(`Salinity (${data.salinity} PSU) is in the caution range.`);
  }


  // pH Level Check
  if (data.pHLevel < thresholds.pHLevelCaution[0]) {
      isSuitable = false;
      issues.push(`pH Level (${data.pHLevel}) indicates significant acidification stress.`);
      threateningFactors.pHLevel = true;
  } else if (data.pHLevel < thresholds.pHLevelIdeal[0]) {
      // issues.push(`pH Level (${data.pHLevel}) is concerning.`);
  }

  // Dissolved Oxygen Check
  if (data.dissolvedOxygen < thresholds.dissolvedOxygenCaution[0]) {
      isSuitable = false;
      issues.push(`Dissolved Oxygen (${data.dissolvedOxygen} mg/L) is dangerously low (hypoxia).`);
      threateningFactors.dissolvedOxygen = true;
  } else if (data.dissolvedOxygen < thresholds.dissolvedOxygenIdeal) {
      // issues.push(`Dissolved Oxygen (${data.dissolvedOxygen} mg/L) is in the warning zone.`);
  }


  // Turbidity Check
  if (data.turbidity > thresholds.turbidityCaution[1]) {
      isSuitable = false;
      issues.push(`Turbidity (${data.turbidity} NTU) is significantly stressing corals.`);
      threateningFactors.turbidity = true;
  } else if (data.turbidity > thresholds.turbidityIdeal) {
      // issues.push(`Turbidity (${data.turbidity} NTU) indicates reduced light penetration.`);
  }

  // Nitrate Check
  if (data.nitrate > thresholds.nitrateCaution[1]) {
      isSuitable = false;
      issues.push(`Nitrate (${data.nitrate} mg/L) levels are high enough to cause algal blooms.`);
      threateningFactors.nitrate = true;
  } else if (data.nitrate > thresholds.nitrateIdeal) {
      // issues.push(`Nitrate (${data.nitrate} mg/L) needs monitoring.`);
  }


  // Determine overall summary
   let summary = '';
   if (isSuitable) {
        // Check if any parameters are in the caution zone even if overall suitable
        const cautionIssues = [
             (data.waterTemperature > thresholds.temperatureIdeal[1] && data.waterTemperature <= thresholds.temperatureCaution[1]) ? 'Temperature in caution zone' : null,
             ((data.salinity >= thresholds.salinityCaution[0] && data.salinity < thresholds.salinityIdeal[0]) || (data.salinity > thresholds.salinityIdeal[1] && data.salinity <= thresholds.salinityCaution[3])) ? 'Salinity in caution zone' : null,
             (data.pHLevel >= thresholds.pHLevelCaution[0] && data.pHLevel < thresholds.pHLevelIdeal[0]) ? 'pH in caution zone' : null,
             (data.dissolvedOxygen >= thresholds.dissolvedOxygenCaution[0] && data.dissolvedOxygen < thresholds.dissolvedOxygenIdeal) ? 'Dissolved Oxygen in caution zone' : null,
             (data.turbidity > thresholds.turbidityIdeal && data.turbidity <= thresholds.turbidityCaution[1]) ? 'Turbidity in caution zone' : null,
             (data.nitrate > thresholds.nitrateIdeal && data.nitrate <= thresholds.nitrateCaution[1]) ? 'Nitrate in caution zone' : null,
        ].filter(Boolean); // Remove nulls

        if (cautionIssues.length > 0) {
            summary = `Environment is suitable, but with factors in caution: ${cautionIssues.join(', ')}.`;
        } else {
            summary = 'Environment is suitable for coral growth.';
        }
    } else {
        summary = `Environment is threatening due to: ${issues.join(' ')}`;
    }


  return {isSuitable, summary, threateningFactors};
};


// Function to calculate a suitability index (0-100)
export const calculateSuitabilityIndex = (data: SensorData, thresholds: Thresholds): number => {
  let score = 100;
  const maxPenalty = 20; // Max penalty per parameter

  // Temperature Penalty
  if (data.waterTemperature < thresholds.temperatureIdeal[0] || data.waterTemperature > thresholds.temperatureCaution[1]) {
    score -= maxPenalty; // Threatening
  } else if (data.waterTemperature > thresholds.temperatureIdeal[1]) {
    score -= maxPenalty * ((data.waterTemperature - thresholds.temperatureIdeal[1]) / (thresholds.temperatureCaution[1] - thresholds.temperatureIdeal[1])); // Caution penalty
  } else if (data.waterTemperature < thresholds.temperatureIdeal[0]) {
      // Add penalty for being too cold if applicable, assuming ideal starts at 24
      // This case might be covered by the first condition if caution doesn't include below ideal
      score -= maxPenalty; // Assuming too cold is also threatening
  }


  // Salinity Penalty
   if (data.salinity < thresholds.salinityCaution[0] || data.salinity > thresholds.salinityCaution[3]) {
      score -= maxPenalty; // Threatening
   } else if (data.salinity < thresholds.salinityIdeal[0]) {
       score -= maxPenalty * ((thresholds.salinityIdeal[0] - data.salinity) / (thresholds.salinityIdeal[0] - thresholds.salinityCaution[0])); // Low caution penalty
   } else if (data.salinity > thresholds.salinityIdeal[1]) {
       score -= maxPenalty * ((data.salinity - thresholds.salinityIdeal[1]) / (thresholds.salinityCaution[3] - thresholds.salinityIdeal[1])); // High caution penalty
   }


  // pH Level Penalty
  if (data.pHLevel < thresholds.pHLevelCaution[0]) {
    score -= maxPenalty; // Threatening
  } else if (data.pHLevel < thresholds.pHLevelIdeal[0]) {
    score -= maxPenalty * ((thresholds.pHLevelIdeal[0] - data.pHLevel) / (thresholds.pHLevelIdeal[0] - thresholds.pHLevelCaution[0])); // Caution penalty
  } else if (data.pHLevel > thresholds.pHLevelIdeal[1]) {
      // Add penalty for being too alkaline if applicable
      // Example: score -= maxPenalty * ((data.pHLevel - thresholds.pHLevelIdeal[1]) / (some_upper_caution_limit - thresholds.pHLevelIdeal[1]));
      // For simplicity, we assume only low pH is penalized based on common coral issues
  }

  // Dissolved Oxygen Penalty
  if (data.dissolvedOxygen < thresholds.dissolvedOxygenCaution[0]) {
    score -= maxPenalty; // Threatening
  } else if (data.dissolvedOxygen < thresholds.dissolvedOxygenIdeal) {
    score -= maxPenalty * ((thresholds.dissolvedOxygenIdeal - data.dissolvedOxygen) / (thresholds.dissolvedOxygenIdeal - thresholds.dissolvedOxygenCaution[0])); // Caution penalty
  }

  // Turbidity Penalty
  if (data.turbidity > thresholds.turbidityCaution[1]) {
    score -= maxPenalty; // Threatening
  } else if (data.turbidity > thresholds.turbidityIdeal) {
    score -= maxPenalty * ((data.turbidity - thresholds.turbidityIdeal) / (thresholds.turbidityCaution[1] - thresholds.turbidityIdeal)); // Caution penalty
  }

  // Nitrate Penalty
  if (data.nitrate > thresholds.nitrateCaution[1]) {
    score -= maxPenalty; // Threatening
  } else if (data.nitrate > thresholds.nitrateIdeal) {
    score -= maxPenalty * ((data.nitrate - thresholds.nitrateIdeal) / (thresholds.nitrateCaution[1] - thresholds.nitrateIdeal)); // Caution penalty
  }

  return Math.max(0, Math.round(score)); // Ensure score is between 0 and 100
};
