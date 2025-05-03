
'use client'; // Mark as client component because it uses TensorFlow.js

import * as tf from '@tensorflow/tfjs';
import type { SensorData, AnalysisResult } from '@/app/page'; // Assuming types are exported from page.tsx or moved to a types file
import { parse } from 'date-fns'; // For parsing date strings

export interface NormalizationParams {
  min: tf.Tensor;
  max: tf.Tensor;
}

// Function to normalize data using Min-Max scaling
const normalizeData = (tensor: tf.Tensor): { normalized: tf.Tensor; normParams: NormalizationParams } => {
  const min = tensor.min(0);
  const max = tensor.max(0);
  // Add a small epsilon to prevent division by zero if min and max are the same
  const range = max.sub(min).add(tf.scalar(1e-7));
  const normalized = tensor.sub(min).div(range);
  return { normalized, normParams: { min, max } };
};

// Function to denormalize data
const denormalizeData = (tensor: tf.Tensor, normParams: NormalizationParams): tf.Tensor => {
  const range = normParams.max.sub(normParams.min).add(tf.scalar(1e-7));
  return tensor.mul(range).add(normParams.min);
};

// Function to train the TensorFlow.js model
export const trainPredictionModel = async (
  data: SensorData[],
  onProgress?: (progress: number) => void // Optional progress callback
): Promise<{ model: tf.Sequential; normParams: NormalizationParams } | null> => {
  console.log("Starting model training in prediction-model.ts...");
  if (data.length < 2) {
    console.log("Not enough data to train on. Skipping model training.");
    return null;
  }

  const numFeatures = 6; // waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate

  // Prepare data for TensorFlow.js
  const features = data.map(item => [
    item.waterTemperature,
    item.salinity,
    item.pHLevel,
    item.dissolvedOxygen,
    item.turbidity,
    item.nitrate,
  ]);
  console.log("Prepared features for training:", features);

  let inputTensor: tf.Tensor2D | null = null;
  let normalizedTensor: tf.Tensor2D | null = null;
  let normParams: NormalizationParams | null = null;

  try {
    inputTensor = tf.tensor2d(features); // Shape: [numRecords, numFeatures]
    console.log("Created input tensor:", inputTensor.shape);

    // Normalize the data
    const normResult = normalizeData(inputTensor);
    normalizedTensor = normResult.normalized as tf.Tensor2D;
    normParams = normResult.normParams;
    console.log("Normalized input tensor:", normalizedTensor.shape);
    console.log("Normalization params (min):", await normParams.min.data());
    console.log("Normalization params (max):", await normParams.max.data());

    // Define a simple sequential model
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [numFeatures] }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: numFeatures })); // Output layer with numFeatures units
    console.log("Defined model architecture.");

    // Compile the model
    model.compile({ optimizer: 'adam', loss: 'meanSquaredError' });
    console.log("Compiled model.");

    // Train the model on NORMALIZED data
    const epochs = 150; // Store epochs in a variable
    console.log(`Starting model fitting for ${epochs} epochs...`);
    await model.fit(normalizedTensor, normalizedTensor, {
      epochs: epochs,
      batchSize: Math.max(1, Math.floor(data.length / 10)), // Dynamic batch size
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss}`);
          if (onProgress) {
            // Calculate progress based on current epoch
            const progress = (epoch + 1) / epochs;
            onProgress(progress); // Call the callback with progress (0 to 1)
          }
        },
      },
    });
    console.log("Model training completed successfully.");
    // Return the model AND normalization parameters
    // Important: normParams must not be null here
    return { model, normParams: normParams! };
  } catch (error) {
    console.error("Error during model training:", error);
    // Optionally re-throw or handle error propagation
    return null;
  } finally {
    // Ensure tensors are disposed even if errors occur
    if (inputTensor) tf.dispose(inputTensor);
    if (normalizedTensor) tf.dispose(normalizedTensor);
    // normParams tensors (min/max) are needed later, DO NOT dispose here
    console.log("Disposed training tensors (input, normalized). Kept normalization params.");
  }
};

// Function to generate predictions using the trained model
export const generatePredictions = async (
  model: tf.Sequential,
  normParams: NormalizationParams,
  initialData: AnalysisResult[], // Use AnalysisResult which includes previous predictions
  numPredictions: number,
  onProgress?: (progress: number) => void // Optional progress callback
): Promise<AnalysisResult[]> => {
    console.log("Starting predictions in prediction-model.ts...");
    let currentInputDataArray: AnalysisResult[] = JSON.parse(JSON.stringify(initialData)); // Deep copy
    let predictedResults: AnalysisResult[] = [];

     // --- Calculate Average Time Difference ---
     let averageTimeDiffMs = 24 * 60 * 60 * 1000; // Default to 1 day if less than 2 records
     if (currentInputDataArray.length >= 2) {
        let totalDiffMs = 0;
        let validDiffs = 0;
        for (let i = 1; i < currentInputDataArray.length; i++) {
            try {
                // Attempt to parse dates, handling potential invalid formats
                const date1 = parse(currentInputDataArray[i].time, 'yyyy-MM-dd', new Date());
                const date2 = parse(currentInputDataArray[i - 1].time, 'yyyy-MM-dd', new Date());
                // Check if parsing was successful (returns a valid Date object, not 'Invalid Date')
                if (!isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
                    const diff = Math.abs(date1.getTime() - date2.getTime());
                    if (diff > 0) { // Only consider positive differences
                        totalDiffMs += diff;
                        validDiffs++;
                    }
                } else {
                    console.warn(`Could not parse dates for time difference calculation: ${currentInputDataArray[i].time}, ${currentInputDataArray[i-1].time}`);
                }
            } catch (e) {
                console.warn(`Error parsing dates: ${currentInputDataArray[i].time}, ${currentInputDataArray[i-1].time}`, e);
            }
        }
         if (validDiffs > 0) {
             averageTimeDiffMs = totalDiffMs / validDiffs;
             console.log(`Calculated average time difference: ${averageTimeDiffMs / (1000 * 60 * 60 * 24)} days`);
         } else {
             console.warn("No valid time differences found, defaulting to 1 day.");
         }
     } else {
         console.warn("Less than 2 data points, defaulting time difference to 1 day.");
     }
     // --- End Calculate Average Time Difference ---


    for (let i = 0; i < numPredictions; i++) {
        console.log(`Predicting step P${i + 1}`);
        // Prepare input tensor from the *last* element of the current data array
        const lastKnownData = currentInputDataArray[currentInputDataArray.length - 1];
        const featuresToPredict = [
            lastKnownData.waterTemperature,
            lastKnownData.salinity,
            lastKnownData.pHLevel,
            lastKnownData.dissolvedOxygen,
            lastKnownData.turbidity,
            lastKnownData.nitrate,
        ];
        let inputTensorRaw: tf.Tensor2D | null = null;
        let inputTensorNormalized: tf.Tensor2D | null = null;
        let predictionTensorNormalized: tf.Tensor<tf.Rank.R2> | null = null;
        let predictionTensorDenormalized: tf.Tensor<tf.Rank.R2> | null = null;

        try {
            inputTensorRaw = tf.tensor2d([featuresToPredict]); // Shape: [1, numFeatures]
            console.log(`Raw input for prediction P${i + 1}:`, featuresToPredict);

            // Normalize the input for prediction using the saved normParams
            inputTensorNormalized = inputTensorRaw.sub(normParams.min).div(normParams.max.sub(normParams.min).add(tf.scalar(1e-7))) as tf.Tensor2D;
            console.log(`Normalized input for prediction P${i + 1}:`, await inputTensorNormalized.data());

            // Generate prediction (output will be normalized)
            predictionTensorNormalized = model.predict(inputTensorNormalized) as tf.Tensor<tf.Rank.R2>;
            console.log(`Normalized prediction P${i + 1}:`, await predictionTensorNormalized.data());

            // De-normalize the prediction
            predictionTensorDenormalized = denormalizeData(predictionTensorNormalized, normParams);
            const predictedValuesRaw = await predictionTensorDenormalized.data();
            console.log(`De-normalized predicted values for P${i + 1}:`, predictedValuesRaw);

            // Calculate the predicted time
             let predictedTimeStr = `P${i + 1}`;
             try {
                 // Attempt to parse the last known time
                 const lastTimeDate = parse(lastKnownData.time, 'yyyy-MM-dd', new Date());
                 if (!isNaN(lastTimeDate.getTime())) {
                     const predictedTime = new Date(lastTimeDate.getTime() + averageTimeDiffMs);
                     // Format the date back to YYYY-MM-DD
                     predictedTimeStr = `${predictedTime.getFullYear()}-${String(predictedTime.getMonth() + 1).padStart(2, '0')}-${String(predictedTime.getDate()).padStart(2, '0')}`;
                 } else {
                     console.warn(`Could not parse last known time for prediction P${i+1}: ${lastKnownData.time}. Using default label.`);
                 }
             } catch (e) {
                 console.warn(`Error calculating predicted time for P${i+1} based on ${lastKnownData.time}`, e);
             }


             // Add slight random variations for realism AFTER de-normalization
            const predictedResult: AnalysisResult = {
                time: predictedTimeStr, // Use calculated or default time string
                location: lastKnownData.location, // Assume same location
                // Apply variations to de-normalized values, ensuring non-negative results
                waterTemperature: Math.max(0, predictedValuesRaw[0] + (Math.random() - 0.5) * 0.1),
                salinity: Math.max(0, predictedValuesRaw[1] + (Math.random() - 0.5) * 0.1),
                pHLevel: Math.max(7, Math.min(9, predictedValuesRaw[2] + (Math.random() - 0.5) * 0.01)), // Constrain pH
                dissolvedOxygen: Math.max(0, predictedValuesRaw[3] + (Math.random() - 0.5) * 0.1),
                turbidity: Math.max(0, predictedValuesRaw[4] + (Math.random() - 0.5) * 0.05),
                nitrate: Math.max(0, predictedValuesRaw[5] + (Math.random() - 0.5) * 0.01),
                isSuitable: null, // Suitability is not determined for predictions
                summary: 'Prediction',
                improvements: [],
                suitabilityIndex: undefined, // No suitability index for predictions
                isPrediction: true,
            };
            console.log(`Formatted prediction result P${i + 1}:`, predictedResult);

            predictedResults.push(predictedResult);

            // Add this prediction to the array for the next prediction step's input
            currentInputDataArray.push(predictedResult);

             if (onProgress) {
                const progress = (i + 1) / numPredictions;
                onProgress(progress); // Call the callback with progress (0 to 1)
            }

        } finally {
            // Dispose tensors used in this prediction step
            if (inputTensorRaw) tf.dispose(inputTensorRaw);
            if (inputTensorNormalized) tf.dispose(inputTensorNormalized);
            if (predictionTensorNormalized) tf.dispose(predictionTensorNormalized);
            if (predictionTensorDenormalized) tf.dispose(predictionTensorDenormalized);
            console.log(`Disposed tensors for prediction P${i + 1}`);
        }
    }

    // Note: normParams tensors (min/max) are disposed in the calling function (analyzeData)
    console.log("Finished predictions in prediction-model.ts.");
    return predictedResults;
};

