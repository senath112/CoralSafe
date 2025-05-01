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
  temperatureCaution: [number, number]; // High caution range
  temperatureLowCaution?: [number, number]; // Optional Low caution range if needed
  salinityIdeal: [number, number];
  salinityCaution: [number, number, number, number]; // For ranges like 31-33 or 36-38
  pHLevelIdeal: [number, number];
  pHLevelCaution: [number, number]; // Low caution range
  pHLevelHighCaution?: [number, number]; // Optional High caution range if needed
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
  temperatureCaution: [28, 30], // High temp caution, above 30 is threatening
  // temperatureLowCaution: [22, 24], // Example if low temp caution is needed
  salinityIdeal: [33, 36],
  salinityCaution: [31, 33, 36, 38], // Below 31 or Above 38 is threatening
  pHLevelIdeal: [8.0, 8.3],
  pHLevelCaution: [7.8, 8.0], // Low pH caution, below 7.8 is threatening
  // pHLevelHighCaution: [8.3, 8.5], // Example if high pH caution is needed
  dissolvedOxygenIdeal: 6.0, // Greater than 6.0
  dissolvedOxygenCaution: [4.0, 6.0], // Below 4.0 is threatening
  turbidityIdeal: 1.0, // Below 1.0
  turbidityCaution: [1.0, 3.0], // Above 3.0 is threatening
  nitrateIdeal: 0.1, // Less than 0.1
  nitrateCaution: [0.1, 0.3], // Above 0.3 is threatening
});

// Function to analyze sensor data against thresholds
export const analyzeSensorData = (data: SensorData, thresholds: Thresholds): AnalysisOutput => {
    let isSuitableOverall = true;
    const issues: string[] = [];
    const threateningFactors = {
        temperature: false,
        salinity: false,
        pHLevel: false,
        dissolvedOxygen: false,
        turbidity: false,
        nitrate: false,
    };
    const cautionFactors: string[] = [];

    // Temperature Check
    if (data.waterTemperature > thresholds.temperatureCaution[1]) { // Above high caution = threatening
        isSuitableOverall = false;
        issues.push(`High temperature (${data.waterTemperature}°C)`);
        threateningFactors.temperature = true;
    } else if (data.waterTemperature > thresholds.temperatureIdeal[1]) { // In high caution range
        cautionFactors.push(`Temp near upper limit (${data.waterTemperature}°C)`);
    } else if (data.waterTemperature < thresholds.temperatureIdeal[0]) { // Below ideal = threatening (assuming no low caution defined)
        isSuitableOverall = false;
        issues.push(`Low temperature (${data.waterTemperature}°C)`);
        threateningFactors.temperature = true;
    }

    // Salinity Check
    if (data.salinity < thresholds.salinityCaution[0] || data.salinity > thresholds.salinityCaution[3]) { // Outside outer caution = threatening
        isSuitableOverall = false;
        issues.push(`Salinity out of safe range (${data.salinity} PSU)`);
        threateningFactors.salinity = true;
    } else if (
        (data.salinity >= thresholds.salinityCaution[0] && data.salinity < thresholds.salinityIdeal[0]) || // Low caution
        (data.salinity > thresholds.salinityIdeal[1] && data.salinity <= thresholds.salinityCaution[3]) // High caution
    ) {
        cautionFactors.push(`Salinity in caution zone (${data.salinity} PSU)`);
    }

    // pH Level Check
    if (data.pHLevel < thresholds.pHLevelCaution[0]) { // Below low caution = threatening
        isSuitableOverall = false;
        issues.push(`Low pH (${data.pHLevel})`);
        threateningFactors.pHLevel = true;
    } else if (data.pHLevel < thresholds.pHLevelIdeal[0]) { // In low caution range
        cautionFactors.push(`pH near lower limit (${data.pHLevel})`);
    }
    // Add check for high pH if pHLevelHighCaution is defined
    // else if (thresholds.pHLevelHighCaution && data.pHLevel > thresholds.pHLevelHighCaution[1]) { ... }


    // Dissolved Oxygen Check
    if (data.dissolvedOxygen < thresholds.dissolvedOxygenCaution[0]) { // Below caution = threatening
        isSuitableOverall = false;
        issues.push(`Low dissolved oxygen (${data.dissolvedOxygen} mg/L)`);
        threateningFactors.dissolvedOxygen = true;
    } else if (data.dissolvedOxygen < thresholds.dissolvedOxygenIdeal) { // In caution range
        cautionFactors.push(`Dissolved oxygen low (${data.dissolvedOxygen} mg/L)`);
    }

    // Turbidity Check
    if (data.turbidity > thresholds.turbidityCaution[1]) { // Above caution = threatening
        isSuitableOverall = false;
        issues.push(`High turbidity (${data.turbidity} NTU)`);
        threateningFactors.turbidity = true;
    } else if (data.turbidity > thresholds.turbidityIdeal) { // In caution range
        cautionFactors.push(`Turbidity elevated (${data.turbidity} NTU)`);
    }

    // Nitrate Check
    if (data.nitrate > thresholds.nitrateCaution[1]) { // Above caution = threatening
        isSuitableOverall = false;
        issues.push(`High nitrate (${data.nitrate} mg/L)`);
        threateningFactors.nitrate = true;
    } else if (data.nitrate > thresholds.nitrateIdeal) { // In caution range
        cautionFactors.push(`Nitrate elevated (${data.nitrate} mg/L)`);
    }


    // Determine overall summary
    let summary = '';
    if (!isSuitableOverall) {
         summary = `Threatening due to: ${issues.join(', ')}.`;
         if (cautionFactors.length > 0) {
             summary += ` Additional cautions: ${cautionFactors.join(', ')}.`;
         }
     } else if (cautionFactors.length > 0) {
         summary = `Suitable, but monitor caution factors: ${cautionFactors.join(', ')}.`;
     } else {
         summary = 'Environment appears ideal for coral growth.';
     }

    // Return isSuitableOverall which reflects if any THREATENING condition was met
    return {isSuitable: isSuitableOverall, summary, threateningFactors};
};


// Function to calculate a suitability index (0-100)
export const calculateSuitabilityIndex = (data: SensorData, thresholds: Thresholds): number => {
  let score = 100;
  const factors = 6;
  const maxPenaltyPerFactor = 100 / factors; // Max penalty per parameter to reach 0

  const calculatePenalty = (value: number, ideal: [number, number], caution: [number, number], isLowThreatening: boolean, isHighThreatening: boolean): number => {
      let penalty = 0;
      const idealRange = ideal[1] - ideal[0];
      const cautionRange = caution[1] - caution[0];

      if (isHighThreatening && value > caution[1]) { // Threateningly high
          penalty = maxPenaltyPerFactor;
      } else if (isLowThreatening && value < caution[0]) { // Threateningly low
           penalty = maxPenaltyPerFactor;
       } else if (value > ideal[1] && value <= caution[1]) { // In high caution zone
          penalty = (maxPenaltyPerFactor * 0.5) * ((value - ideal[1]) / cautionRange); // Max 50% penalty for caution
      } else if (value < ideal[0] && value >= caution[0]) { // In low caution zone
          penalty = (maxPenaltyPerFactor * 0.5) * ((ideal[0] - value) / cautionRange); // Max 50% penalty for caution
      }
      // else: within ideal range, penalty = 0

      // Ensure penalty doesn't exceed max per factor
      return Math.min(penalty, maxPenaltyPerFactor);
  };

   const calculateRangePenalty = (value: number, ideal: [number, number], caution: [number, number, number, number]): number => {
        let penalty = 0;
        const lowCautionRange = ideal[0] - caution[1]; // e.g., 33 - 33 = 0; ideal[0]-caution[0]? 33-31 = 2
        const highCautionRange = caution[3] - ideal[1]; // e.g., 38 - 36 = 2

        if (value < caution[0] || value > caution[3]) { // Threatening
            penalty = maxPenaltyPerFactor;
        } else if (value >= caution[1] && value < ideal[0]) { // Low caution (e.g., 31 <= val < 33)
            penalty = (maxPenaltyPerFactor * 0.5) * ((ideal[0] - value) / (ideal[0] - caution[1] || 1)); // Use caution[1] for lower bound of low caution range
        } else if (value > ideal[1] && value <= caution[2]) { // High caution (e.g., 36 < val <= 38)
             penalty = (maxPenaltyPerFactor * 0.5) * ((value - ideal[1]) / (caution[2] - ideal[1] || 1)); // Use caution[2] for upper bound of high caution range
        }
        return Math.min(penalty, maxPenaltyPerFactor);
    };


   const calculateBoundPenalty = (value: number, idealBound: number, caution: [number, number], isLowerBoundIdeal: boolean): number => {
        let penalty = 0;
        const cautionRange = Math.abs(caution[1] - caution[0]);

       if (isLowerBoundIdeal) { // Ideal is *above* the bound (e.g., Oxygen > 6.0)
           if (value < caution[0]) { // Threateningly low
               penalty = maxPenaltyPerFactor;
           } else if (value >= caution[0] && value < idealBound) { // In caution zone
               penalty = (maxPenaltyPerFactor * 0.5) * ((idealBound - value) / cautionRange);
           }
       } else { // Ideal is *below* the bound (e.g., Turbidity < 1.0, Nitrate < 0.1)
           if (value > caution[1]) { // Threateningly high
               penalty = maxPenaltyPerFactor;
           } else if (value > idealBound && value <= caution[1]) { // In caution zone
               penalty = (maxPenaltyPerFactor * 0.5) * ((value - idealBound) / cautionRange);
           }
       }
        return Math.min(penalty, maxPenaltyPerFactor);
    };


  // Temperature Penalty
  score -= calculatePenalty(data.waterTemperature, thresholds.temperatureIdeal, thresholds.temperatureCaution, true, true); // Assuming too cold is also threatening

  // Salinity Penalty - Special handling for two caution ranges
   score -= calculateRangePenalty(data.salinity, thresholds.salinityIdeal, thresholds.salinityCaution);

  // pH Level Penalty
  score -= calculatePenalty(data.pHLevel, thresholds.pHLevelIdeal, thresholds.pHLevelCaution, true, false); // Low pH is threatening, high might not be defined as such

  // Dissolved Oxygen Penalty
  score -= calculateBoundPenalty(data.dissolvedOxygen, thresholds.dissolvedOxygenIdeal, thresholds.dissolvedOxygenCaution, true); // Ideal is above lower bound

  // Turbidity Penalty
  score -= calculateBoundPenalty(data.turbidity, thresholds.turbidityIdeal, thresholds.turbidityCaution, false); // Ideal is below upper bound

  // Nitrate Penalty
  score -= calculateBoundPenalty(data.nitrate, thresholds.nitrateIdeal, thresholds.nitrateCaution, false); // Ideal is below upper bound


  return Math.max(0, Math.round(score)); // Ensure score is between 0 and 100
};

// // Example usage (keep for testing if needed, remove for production)
// const exampleData: SensorData = {
//   waterTemperature: 27,
//   salinity: 34,
//   pHLevel: 8.1,
//   dissolvedOxygen: 6.5,
//   turbidity: 0.5,
//   nitrate: 0.05,
// };

// const exampleDataCaution: SensorData = {
//   waterTemperature: 29, // caution
//   salinity: 32, // caution
//   pHLevel: 7.9, // caution
//   dissolvedOxygen: 5.0, // caution
//   turbidity: 1.5, // caution
//   nitrate: 0.2, // caution
// };

// const exampleDataThreatening: SensorData = {
//   waterTemperature: 31, // threatening
//   salinity: 30, // threatening
//   pHLevel: 7.7, // threatening
//   dissolvedOxygen: 3.5, // threatening
//   turbidity: 3.5, // threatening
//   nitrate: 0.4, // threatening
// };

// const thresholds = defineSensorDataThresholds();
// console.log("Ideal Data Analysis:", analyzeSensorData(exampleData, thresholds));
// console.log("Ideal Data Index:", calculateSuitabilityIndex(exampleData, thresholds));

// console.log("Caution Data Analysis:", analyzeSensorData(exampleDataCaution, thresholds));
// console.log("Caution Data Index:", calculateSuitabilityIndex(exampleDataCaution, thresholds));

// console.log("Threatening Data Analysis:", analyzeSensorData(exampleDataThreatening, thresholds));
// console.log("Threatening Data Index:", calculateSuitabilityIndex(exampleDataThreatening, thresholds));
