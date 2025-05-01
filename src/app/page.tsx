
'use client';

import {useState, useCallback, useRef, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Avatar, AvatarImage, AvatarFallback} from '@/components/ui/avatar';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {defineSensorDataThresholds, analyzeSensorData, calculateSuitabilityIndex} from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'; // Corrected import path
import type { ChartConfig } from "@/components/ui/chart"; // Import ChartConfig type
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer} from 'recharts'; // Keep Recharts imports if needed for customization
import {Progress} from "@/components/ui/progress";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs';
import {useToast} from "@/hooks/use-toast"; // Ensure useToast is correctly imported
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table"; // Ensure Table components are imported
import {jsPDF} from 'jspdf';
import html2canvas from 'html2canvas';
import Link from 'next/link'; // Import Link for social media icons
import { Fish, Waves, Droplet, Thermometer, Beaker, Wind, CloudFog, Activity, Gauge } from 'lucide-react'; // Import icons


interface AnalysisResult {
  time: string;
  location: string;
  waterTemperature: number;
  salinity: number;
  pHLevel: number;
  dissolvedOxygen: number;
  turbidity: number;
  nitrate: number;
  isSuitable: boolean | null;
  summary?: string;
  improvements?: string[];
  suitabilityIndex?: number;
  isPrediction?: boolean; // Added to distinguish predictions
}

interface SensorData {
  time: string;
  location: string;
  waterTemperature: number;
  salinity: number;
  pHLevel: number;
  dissolvedOxygen: number;
  turbidity: number;
  nitrate: number;
}

interface NormalizationParams {
  min: tf.Tensor;
  max: tf.Tensor;
}

const sensorDataThresholds = defineSensorDataThresholds();

const parameters = [
  {name: 'Water Temperature', key: 'waterTemperature', unit: '°C', icon: Thermometer},
  {name: 'Salinity', key: 'salinity', unit: 'PSU', icon: Waves},
  {name: 'pH Level', key: 'pHLevel', unit: '', icon: Beaker},
  {name: 'Dissolved Oxygen', key: 'dissolvedOxygen', unit: 'mg/L', icon: Wind},
  {name: 'Turbidity', key: 'turbidity', unit: 'NTU', icon: CloudFog},
  {name: 'Nitrate', key: 'nitrate', unit: 'mg/L', icon: Droplet},
];

// Chart Configuration
const chartConfig: ChartConfig = {
  waterTemperature: {label: "Water Temp (°C)", color: "hsl(var(--chart-1))", icon: Thermometer},
  salinity: {label: "Salinity (PSU)", color: "hsl(var(--chart-2))", icon: Waves},
  pHLevel: {label: "pH Level", color: "hsl(var(--chart-3))", icon: Beaker},
  dissolvedOxygen: {label: "Dissolved Oxygen (mg/L)", color: "hsl(var(--chart-4))", icon: Wind},
  turbidity: {label: "Turbidity (NTU)", color: "hsl(var(--chart-5))", icon: CloudFog},
  nitrate: {label: "Nitrate (mg/L)", color: "hsl(var(--accent))", icon: Droplet}, // Changed color
  prediction: {label: "Prediction", color: "hsl(var(--muted-foreground))", icon: () => <path d="M3 3v18h18" fill="none" strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="stroke-muted-foreground"/>}, // Example prediction style
} satisfies ChartConfig;

export default function Home() {
  const [sensorData, setSensorData] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [model, setModel] = useState<{ model: tf.Sequential; normParams: NormalizationParams } | null>(null); // Store model and norm params
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const {toast} = useToast();

  const csvDataRef = useRef<string>('');
  const reportRef = useRef<HTMLDivElement>(null); // Ref for the report section


  // Updated downloadReport to accept expansion options, defaulting to false if not provided
  const downloadReport = (expandSummary = false, expandActions = false) => {
    const input = reportRef.current; // Use the ref
    if (!input) {
      toast({
        title: 'Error',
        description: 'Report element not found.',
        variant: 'destructive',
      });
      return;
    }

    // Temporarily set text to black for PDF generation
    const originalColors = new Map<HTMLElement | SVGTextElement, string>();
    const elementsToColor = input.querySelectorAll<HTMLElement | SVGTextElement>(
      '.text-foreground, .text-muted-foreground, text, tspan'
    );

    elementsToColor.forEach(el => {
      originalColors.set(el, el.style.fill || el.style.color);
      if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
        el.style.fill = 'black';
        el.style.color = '';
      } else {
        el.style.color = 'black';
        el.style.fill = '';
      }
    });

    // Temporarily expand accordions if requested
    const summaryTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-summary-trigger]'));
    const summaryContents = Array.from(input.querySelectorAll<HTMLElement>('[data-summary-content]'));
    const actionsTriggers = Array.from(input.querySelectorAll<HTMLButtonElement>('[data-actions-trigger]'));
    const actionsContents = Array.from(input.querySelectorAll<HTMLElement>('[data-actions-content]'));

    const originalStates = new Map<Element, string | null>();

    const setState = (elements: Element[], state: 'open' | 'closed') => {
        elements.forEach(el => {
            // Only store original state if it hasn't been stored already for this element
            if (!originalStates.has(el)) {
                originalStates.set(el, el.getAttribute('data-state'));
            }
            el.setAttribute('data-state', state);
        });
    };

    // Set states based on passed arguments (defaulting to closed)
    setState(summaryTriggers, expandSummary ? 'open' : 'closed');
    setState(summaryContents, expandSummary ? 'open' : 'closed');
    setState(actionsTriggers, expandActions ? 'open' : 'closed');
    setState(actionsContents, expandActions ? 'open' : 'closed');

    // Force redraw/reflow before html2canvas - small timeout
    setTimeout(() => {
        html2canvas(input, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        })
        .then((canvas) => {
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            const pageHeight = pdf.internal.pageSize.getHeight();
            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
            position = heightLeft - pdfHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;
            }

            pdf.save('coral_safe_report.pdf');
            toast({
            title: 'Success',
            description: 'Report downloaded successfully!',
            });
        })
        .catch((error) => {
            console.error('Error generating PDF:', error);
            toast({
            title: 'Error',
            description: 'Failed to generate PDF. Please try again.',
            variant: 'destructive',
            });
        })
        .finally(() => {
            // Restore original colors
            elementsToColor.forEach(el => {
            const originalColor = originalColors.get(el);
            if (originalColor !== undefined) {
                if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                el.style.fill = originalColor;
                } else {
                el.style.color = originalColor;
                }
            } else {
                if (el instanceof SVGTextElement || el instanceof SVGTSpanElement) {
                el.style.fill = '';
                } else {
                el.style.color = '';
                }
            }
            });

            // Restore original accordion states
            originalStates.forEach((state, el) => {
                if (state) {
                    el.setAttribute('data-state', state);
                } else {
                    el.removeAttribute('data-state');
                }
            });
        });
    }, 100); // Small delay for rendering changes
  };


  const parseData = (data: string): SensorData[] => {
    console.log("Parsing data...");
    // Splitting by newline to separate entries
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length < 2) {
        console.warn("No data rows found after header.");
        return [];
    }
    const header = lines[0].split(',').map(item => item.trim());
    const expectedHeaders = ['Date', 'Location', 'Water_Temperature_C', 'Salinity_PSU', 'pH_Level', 'Dissolved_Oxygen_mg_L', 'Turbidity_NTU', 'Nitrate_mg_L'];

    // Basic header check
    if (JSON.stringify(header) !== JSON.stringify(expectedHeaders)) {
        console.warn("CSV header doesn't match expected format. Proceeding, but results might be inaccurate.");
        // You could throw an error here if strict format is required
        // toast({ title: "Warning", description: "CSV header doesn't match expected format. Results might be inaccurate.", variant: "destructive" });
    }

    const parsedEntries = lines.slice(1).map((entry, index) => { // Skip the header row
      console.log(`Parsing line ${index + 1}: ${entry}`);
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length !== expectedHeaders.length) {
         console.warn(`Skipping incomplete or malformed entry (line ${index + 2}): ${entry}`);
        return null; // Skip incomplete entries
      }

      const [date, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;

      // Convert to appropriate types
      const waterTemperatureNum = parseFloat(waterTemperature);
      const salinityNum = parseFloat(salinity);
      const pHLevelNum = parseFloat(pHLevel);
      const dissolvedOxygenNum = parseFloat(dissolvedOxygen);
      const turbidityNum = parseFloat(turbidity);
      const nitrateNum = parseFloat(nitrate);

      // Validate numeric conversions
      if (
        isNaN(waterTemperatureNum) ||
        isNaN(salinityNum) ||
        isNaN(pHLevelNum) ||
        isNaN(dissolvedOxygenNum) ||
        isNaN(turbidityNum) ||
        isNaN(nitrateNum)
      ) {
         console.warn(`Skipping entry with invalid numeric values (line ${index + 2}): ${entry}`);
        return null;
      }

      return {
        time: date,
        location: location,
        waterTemperature: waterTemperatureNum,
        salinity: salinityNum,
        pHLevel: pHLevelNum,
        dissolvedOxygen: dissolvedOxygenNum,
        turbidity: turbidityNum,
        nitrate: nitrateNum,
      };
    }).filter((item): item is SensorData => item !== null); // Type guard to filter out nulls
    console.log("Parsing completed. Parsed entries:", parsedEntries);
    return parsedEntries;
  };

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

  const trainModel = async (data: SensorData[]): Promise<{ model: tf.Sequential; normParams: NormalizationParams } | null> => {
    console.log("Starting model training...");
    if (data.length < 2) { // Need at least 2 data points to determine range for normalization
      console.log("Not enough data to train on. Skipping model training.");
      toast({
            title: "Training Skipped",
            description: "Need at least 2 data points for model training and prediction.",
            variant: "destructive",
      });
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
        item.nitrate
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
        model.add(tf.layers.dense({units: 64, activation: 'relu', inputShape: [numFeatures]}));
        model.add(tf.layers.dense({units: 32, activation: 'relu'}));
        model.add(tf.layers.dense({units: numFeatures})); // Output layer with numFeatures units
        console.log("Defined model architecture.");

        // Compile the model
        model.compile({optimizer: 'adam', loss: 'meanSquaredError'});
        console.log("Compiled model.");

        // Train the model on NORMALIZED data
        console.log("Starting model fitting...");
        await model.fit(normalizedTensor, normalizedTensor, {
            epochs: 150, // Increased epochs slightly
            batchSize: Math.max(1, Math.floor(data.length / 10)), // Dynamic batch size
            shuffle: true,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                     console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss}`);
                }
            }
        });
        console.log("Model training completed successfully.");
        // Return the model AND normalization parameters
        // Important: normParams must not be null here
        return { model, normParams: normParams! };
    } catch (error) {
        console.error("Error during model training:", error);
        toast({
            title: "Model Training Error",
            description: "An error occurred while training the prediction model.",
            variant: "destructive",
        });
        return null;
    } finally {
         // Ensure tensors are disposed even if errors occur
        if (inputTensor) tf.dispose(inputTensor);
        if (normalizedTensor) tf.dispose(normalizedTensor);
        // normParams tensors (min/max) are needed later, DO NOT dispose here
        console.log("Disposed training tensors (input, normalized). Kept normalization params.");
    }
  };


 const analyzeData = async () => {
    console.log("analyzeData function called.");
    console.log("Current sensor data state:", sensorData);
    if (!sensorData.trim()) {
      console.log("Sensor data is empty. Aborting analysis.");
       toast({
         title: 'Input Error',
         description: 'Please paste sensor data before analyzing.',
         variant: 'destructive',
       });
      return;
    }

    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]); // Clear previous results
    console.log("Set loading state to true and cleared previous results.");
    csvDataRef.current = sensorData; // Store raw CSV data if needed

    try {
        console.log("Parsing sensor data...");
        const parsedData = parseData(sensorData);
        console.log("Parsed data:", parsedData);

        if (!parsedData || parsedData.length === 0) {
            console.log("No valid data after parsing.");
            toast({
                title: 'Error',
                description: 'No valid data found or data format is incorrect. Please check your input.',
                variant: 'destructive',
            });
            setIsLoading(false);
            return;
        }

        // Train the model first
        console.log("Training model...");
        setAnalysisProgress(10); // Start progress
        const trainingResult = await trainModel(parsedData);
        setModel(trainingResult); // Save the trained model and norm params
        console.log("Model training finished. Training result:", trainingResult);
        setAnalysisProgress(30); // Progress after training

        // Process each data point for suitability analysis
        console.log("Analyzing each data point for suitability...");
        let detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
            console.log(`Analyzing data point ${index}:`, data);
            const {isSuitable, summary, threateningFactors} = analyzeSensorData(
                data,
                sensorDataThresholds
            );
            const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
             console.log(`Analysis for point ${index}: Suitable - ${isSuitable}, Index - ${suitabilityIndex}`);

            let improvements: string[] = [];
             if (isSuitable === false) { // Check explicitly for false, as null means prediction
                 console.log(`Generating improvements for unsuitable point ${index}`);
                 improvements = Object.entries(threateningFactors)
                 .filter(([_, value]) => value) // Filter only true (threatening) factors
                 .map(([key]) => {
                     switch(key) {
                         case 'temperature': return "Address high/low water temperature issues.";
                         case 'salinity': return "Investigate and mitigate salinity fluctuations.";
                         case 'pHLevel': return "Monitor and address pH imbalances (acidification).";
                         case 'dissolvedOxygen': return "Improve water circulation or reduce oxygen consumption sources.";
                         case 'turbidity': return "Reduce sediment runoff or sources of water cloudiness.";
                         case 'nitrate': return "Control nutrient inputs from runoff or pollution.";
                         default: return `Address issues related to ${key}.`;
                     }
                 });
                 if (improvements.length === 0) {
                    // If marked unsuitable but no specific factor crossed the 'threatening' line,
                    // it means multiple factors are likely in the 'caution' zone.
                    improvements = ["Multiple parameters are in caution ranges, contributing to overall unsuitability. Review all parameters."];
                 }
                 console.log(`Improvements for point ${index}:`, improvements);
            } else if (isSuitable === true) {
                 // Check if there are any caution factors even if overall suitable
                 const cautions = analyzeSensorData(data, sensorDataThresholds).summary.includes('caution factors:');
                 if (cautions) {
                     improvements = ["Environment is suitable, but monitor parameters in caution ranges."];
                 } else {
                     improvements = ["Environment appears ideal, continue monitoring."];
                 }
            } else {
                 improvements = []; // No improvements for predictions (isSuitable is null)
            }


            // Update progress during analysis phase (30% to 60%)
            const currentProgress = 30 + ((index + 1) / parsedData.length) * 30;
            setAnalysisProgress(currentProgress);
            console.log(`Analysis progress: ${currentProgress.toFixed(0)}%`);

            return {
                ...data,
                isSuitable,
                summary,
                improvements,
                suitabilityIndex,
                isPrediction: false,
            };
        });
        console.log("Finished suitability analysis for all data points.");

        // Perform predictions only if the model was trained successfully
        if (trainingResult) {
            console.log("Starting predictions...");
            const { model: trainedModel, normParams } = trainingResult;
            const numPredictions = 5;
            // IMPORTANT: Make a deep copy for iterative prediction
             let currentInputDataArray: AnalysisResult[] = JSON.parse(JSON.stringify(detailedResults));
             let predictedResults: AnalysisResult[] = [];

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
                     predictionTensorNormalized = trainedModel.predict(inputTensorNormalized) as tf.Tensor<tf.Rank.R2>;
                     console.log(`Normalized prediction P${i + 1}:`, await predictionTensorNormalized.data());

                     // De-normalize the prediction
                     predictionTensorDenormalized = denormalizeData(predictionTensorNormalized, normParams);
                     const predictedValuesRaw = await predictionTensorDenormalized.data();
                     console.log(`De-normalized predicted values for P${i + 1}:`, predictedValuesRaw);

                     // Add slight random variations for realism AFTER de-normalization
                    const predictedResult: AnalysisResult = {
                        time: `P${i + 1}`,
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
                     // **Crucially, use the predicted data for the next prediction**
                     currentInputDataArray.push(predictedResult);

                 } finally {
                    // Dispose tensors used in this prediction step
                    if (inputTensorRaw) tf.dispose(inputTensorRaw);
                    if (inputTensorNormalized) tf.dispose(inputTensorNormalized);
                    if (predictionTensorNormalized) tf.dispose(predictionTensorNormalized);
                    if (predictionTensorDenormalized) tf.dispose(predictionTensorDenormalized);
                    console.log(`Disposed tensors for prediction P${i + 1}`);
                 }

                // Update progress during prediction phase (60% to 100%)
                const predictionProgress = 60 + ((i + 1) / numPredictions) * 40;
                setAnalysisProgress(predictionProgress);
                console.log(`Prediction progress: ${predictionProgress.toFixed(0)}%`);
            }
            // Dispose the normalization parameter tensors after all predictions are done
             if (normParams) {
                tf.dispose([normParams.min, normParams.max]);
                console.log("Disposed normalization parameter tensors.");
             } else {
                 console.warn("Normalization parameters were null, cannot dispose.");
             }

             // Combine original analyzed results with new predictions
             detailedResults = [...detailedResults, ...predictedResults];

            console.log("Finished predictions.");
        } else {
             console.log("Model training failed or skipped. No predictions will be made.");
             setAnalysisProgress(100); // If no model, progress is complete after analysis
             toast({
                 title: "Prediction Skipped",
                 description: "Model training failed or was skipped, so predictions could not be made.",
                 variant: "destructive", // Or "default" if just informational
             });
        }

        console.log("Final analysis results (including predictions):", detailedResults);
        setAnalysisResults(detailedResults);
        toast({
            title: 'Success',
            description: 'Data analyzed and predictions generated successfully!',
        });

    } catch (error: any) {
        console.error('Error during analysis:', error);
        toast({
            title: 'Error',
            description: `An error occurred: ${error.message}. Check console for details.`,
            variant: 'destructive',
        });
        setAnalysisProgress(0); // Reset progress on error
    } finally {
        console.log("Analysis process finished. Setting loading state to false.");
        setIsLoading(false);
        // Ensure progress completes if successful or if it stopped partway
        if (analysisProgress < 100) { // Check if progress needs setting to 100
             setAnalysisProgress(100);
         }
    }
};


  return (
    <div ref={reportRef} className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-300 via-blue-400 to-teal-500 text-foreground"> {/* Added text-foreground */}

      {/* Header Section */}
      <header className="w-full max-w-5xl mb-8 text-center text-white shadow-lg p-4 rounded-lg bg-black/30 backdrop-blur-sm"> {/* Header text remains white */}
         <div className="flex items-center justify-center mb-2">
            <Fish className="w-10 h-10 mr-3 text-cyan-300 animate-pulse" />
            <h1 className="text-4xl font-bold">CoralGuard</h1>
          </div>
        <p className="text-lg text-cyan-100">V2.0 - Mariana</p>
        <p className="mt-4 text-sm text-blue-200">
          Made with love by Senath Sethmika
        </p>
        {/* Removed social media links */}
      </header>

      <div className="max-w-7xl w-full space-y-8">
        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30"> {/* Card text uses foreground */}
           <CardHeader>
             <div className="flex items-center mb-4">
               <Avatar>
                 <AvatarImage data-ai-hint="coral" src="https://picsum.photos/seed/coralreef/50/50" alt="CoralSafe Logo" className="border-2 border-cyan-300 rounded-full" />
                 <AvatarFallback className="bg-cyan-500 text-white">CS</AvatarFallback>
               </Avatar>
                <CardTitle className="ml-4 text-2xl font-semibold text-foreground">CoralSafe: Sensor Data Analyzer</CardTitle> {/* Title uses foreground */}
             </div>

            <CardDescription className="text-muted-foreground text-sm"> {/* Description uses muted foreground */}
              <p className="font-medium mb-1 text-foreground">Paste your CSV sensor data below.</p> {/* Explicitly set to foreground */}
              <p className="text-foreground">Expected Format: <code className="bg-black/20 px-1 py-0.5 rounded text-xs">Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</code></p> {/* Explicitly set to foreground */}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Example:&#10;2023-01-01,Reef A,26.5,35.2,8.1,6.5,0.8,0.05&#10;2023-01-02,Reef A,26.7,35.1,8.1,6.6,0.7,0.04"
              value={sensorData}
              onChange={(e) => {
                console.log("Sensor data changed:", e.target.value);
                setSensorData(e.target.value);
              }}
              className="min-h-[150px] text-sm p-3 border border-gray-300 dark:border-gray-700 rounded-md shadow-inner focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" // Ensure textarea text is visible
            />
            <Button
              onClick={analyzeData} // Correctly bind the function
              disabled={isLoading || !sensorData.trim()}
              className="mt-4 w-full bg-cyan-500 text-white hover:bg-cyan-600 disabled:opacity-50 transition-all duration-300 transform hover:scale-105 shadow-md text-lg font-semibold py-3 rounded-lg"
            >
              <Activity className="w-5 h-5 mr-2"/> {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
             {isLoading && (
                 <div className="w-full px-4 mt-4">
                     <Progress value={analysisProgress} className="w-full [&>div]:bg-cyan-400 h-2.5 rounded-full bg-white/30" />
                     <p className="text-center text-sm text-white/80 mt-2">Analysis Progress: {analysisProgress.toFixed(0)}%</p> {/* Added percentage display */}
                 </div>
             )}
          </CardContent>
        </Card>


      {/* Analysis Results Table */}
      {analysisResults.length > 0 && (
          <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xl font-semibold text-foreground">Analysis Results</CardTitle> {/* Title uses foreground */}
                 {/* Simple Download Button - No Dialog */}
                 <Button
                    onClick={() => downloadReport()} // Call directly, default is accordions closed
                    className="bg-cyan-500 text-white hover:bg-cyan-600 transition-colors duration-300 shadow-sm"
                    size="sm"
                 >
                    <Gauge className="w-4 h-4 mr-2"/> Download Report (PDF)
                 </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10">
                  <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                    <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Time</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Location</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Suitability</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Water Temp (°C)</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Salinity (PSU)</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">pH Level</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Oxygen (mg/L)</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Turbidity (NTU)</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-right font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Nitrate (mg/L)</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Summary</TableHead> {/* Header uses foreground */}
                    <TableHead className="text-left font-medium py-3 px-4 text-foreground">Suggested Actions</TableHead> {/* Header uses foreground */}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => {
                      const isPrediction = result.isSuitable === null; // Check if it's a prediction
                      let suitabilityClass = '';
                      let suitabilityText = '';
                      let suitabilityIndexText = result.suitabilityIndex !== undefined ? `(${result.suitabilityIndex.toFixed(0)})` : '';


                      if (isPrediction) {
                          suitabilityClass = 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-300'; // Prediction text color adapts
                          suitabilityText = 'Prediction';
                          suitabilityIndexText = ''; // No index for predictions
                      } else {
                           const isIdeal = result.isSuitable === true && !analyzeSensorData(result, sensorDataThresholds).summary.includes('caution factors:');
                           const isWarning = result.isSuitable === true && analyzeSensorData(result, sensorDataThresholds).summary.includes('caution factors:');
                           const isThreatening = result.isSuitable === false;

                           if (isIdeal) {
                               suitabilityClass = 'bg-green-200 dark:bg-green-800/50 text-green-800 dark:text-green-200'; // Specific color for ideal
                               suitabilityText = 'Suitable';
                           } else if (isWarning) {
                               suitabilityClass = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200'; // Specific color for warning
                               suitabilityText = 'Warning';
                           } else { // Must be Threatening
                               suitabilityClass = 'bg-red-200 dark:bg-red-800/50 text-red-800 dark:text-red-200'; // Specific color for threatening
                               suitabilityText = 'Threatening';
                           }
                       }


                    return (
                      <TableRow key={index} className="border-b border-cyan-200/30 dark:border-cyan-700/30 last:border-0 hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150">
                        <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.time}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.location}</TableCell> {/* Cell uses foreground */}
                        <TableCell className={`py-2 text-center border-r border-cyan-200/30 dark:border-cyan-700/30 px-4`}>
                           <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium shadow-sm ${suitabilityClass}`}>
                                {suitabilityText} {suitabilityIndexText}
                            </span>
                        </TableCell>
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.waterTemperature.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.salinity.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.pHLevel.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.dissolvedOxygen.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.turbidity.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                        <TableCell className="py-2 text-right border-r border-cyan-200/30 dark:border-cyan-700/30 px-4 text-foreground">{result.nitrate.toFixed(2)}</TableCell> {/* Cell uses foreground */}
                         <TableCell className="py-2 border-r border-cyan-200/30 dark:border-cyan-700/30 px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`summary-${index}`} className="border-b-0">
                                <AccordionTrigger data-summary-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View</AccordionTrigger> {/* Trigger uses foreground */}
                                <AccordionContent data-summary-content className="text-xs pt-1 pb-2 text-muted-foreground"> {/* Content uses muted foreground */}
                                  {result.summary || 'N/A'}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                        </TableCell>
                         <TableCell className="py-2 px-4">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value={`actions-${index}`} className="border-b-0">
                                <AccordionTrigger data-actions-trigger className="py-1 text-xs hover:no-underline [&>svg]:text-cyan-500 text-foreground">View Actions</AccordionTrigger> {/* Trigger uses foreground */}
                                <AccordionContent data-actions-content>
                                   <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground"> {/* Content uses muted foreground */}
                                       {result.improvements && result.improvements.length > 0 ? (
                                           result.improvements.map((improvement, i) => (
                                               <li key={i}>{improvement}</li>
                                            ))
                                       ) : (
                                           <li>No specific actions suggested.</li>
                                       )}
                                   </ul>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
      )}

        {/* Charts Section */}
        {analysisResults.length > 0 && (
            <Accordion type="multiple" className="w-full space-y-4">
                {parameters.map((parameter) => (
                     <AccordionItem value={parameter.key} key={parameter.key} className="border-none">
                        <Card className="bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden"> {/* Card text uses foreground */}
                            <AccordionTrigger className="text-lg font-medium p-4 hover:no-underline hover:bg-cyan-500/10 dark:hover:bg-cyan-400/10 transition-colors duration-150 rounded-t-xl w-full flex items-center justify-between text-foreground"> {/* Trigger uses foreground */}
                                <div className="flex items-center">
                                    <parameter.icon className="w-5 h-5 mr-2 text-cyan-500"/>
                                    {parameter.name} Trends
                                </div>
                                {/* Chevron is automatically added by AccordionTrigger */}
                            </AccordionTrigger>
                             <AccordionContent className="p-4 border-t border-cyan-200/30 dark:border-cyan-700/30">
                                <p className="text-sm text-muted-foreground mb-4 text-foreground"> {/* Ensure description text uses foreground */}
                                    Visualizing {parameter.name} ({parameter.unit}) over time, including predicted values.
                                </p>
                                <ChartContainer config={chartConfig} className="aspect-video h-[300px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart
                                          data={analysisResults} // Use combined results
                                          margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                                        >
                                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.5)" />
                                          <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{fontSize: 12, fill: 'hsl(var(--foreground))'}} axisLine={false} tickLine={false} padding={{left: 10, right: 10}}/> {/* Axis/Tick uses foreground */}
                                          <YAxis stroke="hsl(var(--foreground))" tick={{fontSize: 12, fill: 'hsl(var(--foreground))'}} axisLine={false} tickLine={false} domain={['auto', 'auto']} /> {/* Axis/Tick uses foreground */}
                                           <RechartsTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        indicator="dot"
                                                        labelClassName="text-sm font-medium text-foreground" // Ensure tooltip label uses foreground
                                                        className="rounded-lg border border-border/50 bg-background/90 p-2 shadow-lg backdrop-blur-sm text-foreground" // Ensure tooltip content uses foreground
                                                    />
                                                }
                                                 cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3"}}
                                            />
                                          <RechartsLegend content={<ChartLegendContent icon={chartConfig[parameter.key]?.icon} nameKey={parameter.key} payload={ // Pass necessary props
                                              Object.entries(chartConfig)
                                                .filter(([key]) => key === parameter.key || key === 'prediction') // Only show current param and prediction legend
                                                .map(([key, config]) => ({
                                                  value: config.label,
                                                  type: key === 'prediction' ? 'dashed' : 'line',
                                                  id: key,
                                                  color: key === 'prediction' ? config.color : chartConfig[parameter.key]?.color, // Use correct colors
                                                  icon: config.icon // Pass icon
                                                }))
                                            } className="text-foreground" />} // Ensure legend text uses foreground
                                          />
                                          {/* Line for actual data */}
                                          <Line
                                            dataKey={(payload: AnalysisResult) => payload.isPrediction ? null : payload[parameter.key as keyof AnalysisResult]} // Only plot non-predictions
                                            type="monotone"
                                            stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use color from chartConfig
                                            strokeWidth={2.5}
                                            dot={true} // Use default dots to connect points
                                             activeDot={{ r: 6, strokeWidth: 2, stroke: 'hsl(var(--background))', fill: chartConfig[parameter.key]?.color || '#8884d8' }}
                                            name={parameter.name}
                                            connectNulls={true} // Connect nulls for the main line
                                            isAnimationActive={false}
                                          />
                                           {/* Line segment specifically for predictions */}
                                           <Line
                                                dataKey={(payload: AnalysisResult) => payload.isPrediction ? payload[parameter.key as keyof AnalysisResult] : null} // Only plot predictions
                                                stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use same base color
                                                strokeWidth={2.5}
                                                strokeDasharray="5 5" // Dashed line for predictions
                                                dot={true} // Use default dots for predictions as well
                                                activeDot={false} // No active dot effect for prediction line segment
                                                connectNulls={true} // Connect nulls for the prediction line start
                                                name={`${parameter.name} (Pred.)`}
                                                isAnimationActive={false}
                                             />

                                        </LineChart>
                                    </ResponsiveContainer>
                                </ChartContainer>
                             </AccordionContent>
                         </Card>
                    </AccordionItem>
                ))}
            </Accordion>
        )}

      {/* Parameter Ranges Table */}
      {analysisResults.length > 0 && (
          <Card className="mt-8 bg-white/90 dark:bg-slate-900/90 text-foreground shadow-xl rounded-xl backdrop-blur-md border border-white/30 overflow-hidden"> {/* Card text uses foreground */}
            <CardHeader>
                <CardTitle className="text-xl font-semibold text-foreground">Parameter Ranges for Coral Health</CardTitle> {/* Title uses foreground */}
                <CardDescription className="text-muted-foreground text-sm text-foreground">Reference thresholds for ideal, caution, and threatening conditions.</CardDescription> {/* Description uses foreground */}
            </CardHeader>
            <CardContent className="p-0">
               <div className="overflow-x-auto">
               <Table className="min-w-full">
                    <TableHeader className="bg-cyan-600/10 dark:bg-cyan-400/10">
                        <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableHead className="text-left font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 text-foreground">Parameter</TableHead> {/* Header uses foreground */}
                            <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-green-100/50 dark:bg-green-900/50 text-green-800 dark:text-green-200">Ideal Range</TableHead>
                            <TableHead className="text-center font-medium py-3 px-4 border-r border-cyan-200/30 dark:border-cyan-700/30 bg-yellow-100/50 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200">Caution Range</TableHead>
                            <TableHead className="text-center font-medium py-3 px-4 bg-red-100/50 dark:bg-red-900/50 text-red-800 dark:text-red-200">Threatening Condition</TableHead>
                        </TableRow>
                    </TableHeader>
                     <TableBody>
                        <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Water Temperature (°C)</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">24-28</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">28-30</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Above 30 (Bleaching risk)</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                        <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Salinity (PSU)</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">33-36</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">31-33 or 36-38</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Below 31 or Above 38</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                         <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">pH Level</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">8.0-8.3</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">7.8-8.0</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Below 7.8 (Acidification)</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                         <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Dissolved Oxygen (mg/L)</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&gt; 6.0</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">4.0-6.0</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Below 4.0 (Hypoxia)</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                         <TableRow className="border-b border-cyan-200/30 dark:border-cyan-700/30">
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Turbidity (NTU)</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&lt; 1.0</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">1.0-3.0</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Above 3.0</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                        <TableRow className="border-b-0"> {/* Last row no bottom border */}
                            <TableCell className="font-medium border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">Nitrate (mg/L)</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">&lt; 0.1</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center border-r border-cyan-200/30 dark:border-cyan-700/30 py-2 px-4 text-foreground">0.1-0.3</TableCell> {/* Cell uses foreground */}
                            <TableCell className="text-center py-2 px-4 text-foreground">Above 0.3 (Algal blooms)</TableCell> {/* Cell uses foreground */}
                        </TableRow>
                    </TableBody>
                </Table>
                </div>
            </CardContent>
          </Card>
      )}

      </div>

       {/* Footer Section */}
      <footer className="w-full max-w-5xl mt-12 text-center text-white/70 text-xs p-4"> {/* Footer text remains white/muted */}
        <p>&copy; {new Date().getFullYear()} CoralGuard by Senath Sethmika. All rights reserved.</p>
        <p>Data analysis for educational and informational purposes only.</p>
        <div className="flex justify-center space-x-4 mt-2">
             <Link href="https://www.linkedin.com/in/senath-sethmika/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                LinkedIn
            </Link>
            <Link href="https://web.facebook.com/senath.sethmika/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                 Facebook
             </Link>
             <Link href="https://github.com/senath112" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors duration-300">
                Github
            </Link>
        </div>
      </footer>

    </div>
  );
}

