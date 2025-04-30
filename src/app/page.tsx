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
  ChartStyle,
  ChartConfig
} from '@/components/ui/chart'; // Corrected import path
import {LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend as RechartsLegend, ResponsiveContainer} from 'recharts'; // Keep Recharts imports if needed for customization
import {Progress} from "@/components/ui/progress";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs';
import {useToast} from "@/hooks/use-toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {jsPDF} from 'jspdf';
import html2canvas from 'html2canvas';

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
  {name: 'Water Temperature', key: 'waterTemperature', unit: '°C'},
  {name: 'Salinity', key: 'salinity', unit: 'PSU'},
  {name: 'pH Level', key: 'pHLevel', unit: ''},
  {name: 'Dissolved Oxygen', key: 'dissolvedOxygen', unit: 'mg/L'},
  {name: 'Turbidity', key: 'turbidity', unit: 'NTU'},
  {name: 'Nitrate', key: 'nitrate', unit: 'mg/L'},
];

// Chart Configuration
const chartConfig: ChartConfig = {
  waterTemperature: {label: "Water Temp (°C)", color: "hsl(var(--chart-1))"},
  salinity: {label: "Salinity (PSU)", color: "hsl(var(--chart-2))"},
  pHLevel: {label: "pH Level", color: "hsl(var(--chart-3))"},
  dissolvedOxygen: {label: "Dissolved Oxygen (mg/L)", color: "hsl(var(--chart-4))"},
  turbidity: {label: "Turbidity (NTU)", color: "hsl(var(--chart-5))"},
  nitrate: {label: "Nitrate (mg/L)", color: "hsl(var(--accent))"}, // Changed color
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

  const downloadReport = () => {
    const input = document.getElementById('report');
    if (!input) {
      toast({
        title: 'Error',
        description: 'Report element not found.',
        variant: 'destructive',
      });
      return;
    }

    html2canvas(input, {scale: 2})
      .then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
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
      });
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
    const normalized = tensor.sub(min).div(max.sub(min));
    return { normalized, normParams: { min, max } };
  };

  // Function to denormalize data
  const denormalizeData = (tensor: tf.Tensor, normParams: NormalizationParams): tf.Tensor => {
    return tensor.mul(normParams.max.sub(normParams.min)).add(normParams.min);
  };

  const trainModel = async (data: SensorData[]): Promise<{ model: tf.Sequential; normParams: NormalizationParams } | null> => {
    console.log("Starting model training...");
    if (data.length === 0) {
      console.log("No data to train on. Skipping model training.");
      return null; // No data to train on
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

    const inputTensor = tf.tensor2d(features); // Shape: [numRecords, numFeatures]
    console.log("Created input tensor:", inputTensor.shape);

    // Normalize the data
    const { normalized: normalizedTensor, normParams } = normalizeData(inputTensor);
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
    try {
        console.log("Starting model fitting...");
        await model.fit(normalizedTensor, normalizedTensor, {
            epochs: 150, // Increased epochs slightly
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                     console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss}`);
                }
            }
        });
        console.log("Model training completed successfully.");
        // Return the model AND normalization parameters
        return { model, normParams };
    } catch (error) {
        console.error("Error during model training:", error);
        toast({
            title: "Model Training Error",
            description: "An error occurred while training the prediction model.",
            variant: "destructive",
        });
        return null;
    } finally {
        tf.dispose([inputTensor, normalizedTensor]); // Dispose tensors
        console.log("Disposed input and normalized tensors.");
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
        const trainingResult = await trainModel(parsedData);
        setModel(trainingResult); // Save the trained model and norm params
        console.log("Model training finished. Training result:", trainingResult);

        // Process each data point for suitability analysis
        console.log("Analyzing each data point for suitability...");
        const detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
            console.log(`Analyzing data point ${index}:`, data);
            const {isSuitable, summary, threateningFactors} = analyzeSensorData(
                data,
                sensorDataThresholds
            );
            const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
             console.log(`Analysis for point ${index}: Suitable - ${isSuitable}, Index - ${suitabilityIndex}`);

            let improvements: string[] = [];
             if (!isSuitable) {
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
                    improvements = ["Consider general water quality improvements."]; // Fallback
                 }
                 console.log(`Improvements for point ${index}:`, improvements);
            } else {
                 improvements = ["Environment appears suitable, continue monitoring."];
            }


            // Update progress
            const currentProgress = ((index + 1) / parsedData.length) * 50;
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
            let currentInputDataArray = [...detailedResults]; // Start with all historical data (now includes analysis results)

            for (let i = 0; i < numPredictions; i++) {
                 console.log(`Predicting step P${i + 1}`);
                 // Prepare input tensor from the *current* state of the data including previous predictions
                 const lastKnownData = currentInputDataArray[currentInputDataArray.length - 1];
                 const featuresToPredict = [
                    lastKnownData.waterTemperature,
                    lastKnownData.salinity,
                    lastKnownData.pHLevel,
                    lastKnownData.dissolvedOxygen,
                    lastKnownData.turbidity,
                    lastKnownData.nitrate,
                 ];
                 const inputTensorRaw = tf.tensor2d([featuresToPredict]); // Shape: [1, numFeatures]
                 console.log(`Raw input for prediction P${i + 1}:`, featuresToPredict);

                 // Normalize the input for prediction using the saved normParams
                 const inputTensorNormalized = inputTensorRaw.sub(normParams.min).div(normParams.max.sub(normParams.min));
                 console.log(`Normalized input for prediction P${i + 1}:`, await inputTensorNormalized.data());


                // Generate prediction (output will be normalized)
                 const predictionTensorNormalized = trainedModel.predict(inputTensorNormalized) as tf.Tensor<tf.Rank.R2>;
                 console.log(`Normalized prediction P${i + 1}:`, await predictionTensorNormalized.data());

                 // De-normalize the prediction
                 const predictionTensorDenormalized = denormalizeData(predictionTensorNormalized, normParams);
                 const predictedValuesRaw = await predictionTensorDenormalized.data();
                 console.log(`De-normalized predicted values for P${i + 1}:`, predictedValuesRaw);


                 tf.dispose([inputTensorRaw, inputTensorNormalized, predictionTensorNormalized, predictionTensorDenormalized]); // Dispose tensors

                 // Add slight random variations for realism AFTER de-normalization
                const predictedResult: AnalysisResult = {
                    time: `P${i + 1}`,
                    location: lastKnownData.location, // Assume same location
                    // Apply variations to de-normalized values
                    waterTemperature: Math.max(0, predictedValuesRaw[0] + (Math.random() - 0.5) * 0.1),
                    salinity: Math.max(0, predictedValuesRaw[1] + (Math.random() - 0.5) * 0.1),
                    pHLevel: Math.max(0, predictedValuesRaw[2] + (Math.random() - 0.5) * 0.01),
                    dissolvedOxygen: Math.max(0, predictedValuesRaw[3] + (Math.random() - 0.5) * 0.1),
                    turbidity: Math.max(0, predictedValuesRaw[4] + (Math.random() - 0.5) * 0.05),
                    nitrate: Math.max(0, predictedValuesRaw[5] + (Math.random() - 0.5) * 0.01),
                    isSuitable: null, // Suitability is not determined for predictions
                    summary: 'Prediction',
                    improvements: [],
                    suitabilityIndex: undefined,
                    isPrediction: true,
                };
                 console.log(`Formatted prediction result P${i + 1}:`, predictedResult);

                detailedResults.push(predictedResult);

                 // Add this prediction to the array for the next prediction step
                 currentInputDataArray.push(predictedResult);

                // Update progress
                const predictionProgress = 50 + ((i + 1) / numPredictions) * 50;
                setAnalysisProgress(predictionProgress);
                console.log(`Prediction progress: ${predictionProgress.toFixed(0)}%`);
            }
            console.log("Finished predictions.");
        } else {
             console.log("Model training failed or skipped. No predictions will be made.");
             setAnalysisProgress(100); // If no model, progress is complete after analysis
             toast({
                 title: "Prediction Skipped",
                 description: "Model training failed, skipping predictions.",
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
    } finally {
        console.log("Analysis process finished. Setting loading state to false.");
        setIsLoading(false);
        setAnalysisProgress(100); // Ensure progress completes
    }
};


  return (
    <div id="report" className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-5xl w-full space-y-8">
        <Card className="bg-card shadow-md rounded-md">
           <CardHeader>
             <div className="flex items-center">
               <Avatar>
                 <AvatarImage src="https://picsum.photos/50/50" alt="CoralSafe Logo" className="mr-2 rounded-full" />
                 <AvatarFallback>CS</AvatarFallback>
               </Avatar>
               <CardTitle className="ml-4">CoralSafe: Sensor Data Analyzer</CardTitle>
             </div>

            <CardDescription>
              <p>Sensor Data Input</p>
              <p>Format: Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</p>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Paste sensor data here"
              value={sensorData}
              onChange={(e) => {
                console.log("Sensor data changed:", e.target.value);
                setSensorData(e.target.value);
              }}
              className="min-h-[150px] text-sm p-3 border rounded-md shadow-inner focus:ring-accent focus:border-accent"
            />
            <Button
              onClick={analyzeData} // Correctly bind the function
              disabled={isLoading || !sensorData.trim()}
              className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
             {isLoading && (
                 <div className="w-full px-4 mt-4">
                     <Progress value={analysisProgress} className="w-full [&>div]:bg-accent" />
                     <p className="text-center text-sm text-muted-foreground mt-2">Analysis Progress: {analysisProgress.toFixed(0)}%</p>
                 </div>
             )}
          </CardContent>
        </Card>



      {analysisResults.length > 0 && (
          <Card className="bg-card shadow-md rounded-md">
            <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
                <Button onClick={downloadReport} className="mt-2 bg-accent text-accent-foreground hover:bg-accent/90" size="sm">Download Report (PDF)</Button>
            </CardHeader>
            <CardContent>
              <Table className="rounded-md shadow-md border border-border">
                <TableHeader>
                  <TableRow className="border-b border-border">
                    <TableHead className="text-left font-medium border-r border-border py-2 px-3">Time</TableHead>
                    <TableHead className="text-left font-medium border-r border-border py-2 px-3">Location</TableHead>
                    <TableHead className="text-center font-medium border-r border-border py-2 px-3">Suitability</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">Water Temp (°C)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">Salinity (PSU)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">pH Level</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">Oxygen (mg/L)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">Turbidity (NTU)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border py-2 px-3">Nitrate (mg/L)</TableHead>
                    <TableHead className="text-left font-medium border-r border-border py-2 px-3">Summary</TableHead>
                    <TableHead className="text-left font-medium py-2 px-3">Suggested Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => {
                      const isIdeal = result.isSuitable === true;
                      const isWarning = result.isSuitable === false && (
                          (result.waterTemperature > sensorDataThresholds.temperatureIdeal[1] && result.waterTemperature <= sensorDataThresholds.temperatureCaution[1]) ||
                          ((result.salinity >= sensorDataThresholds.salinityCaution[0] && result.salinity < sensorDataThresholds.salinityIdeal[0]) || (result.salinity > sensorDataThresholds.salinityIdeal[1] && result.salinity <= sensorDataThresholds.salinityCaution[3])) ||
                          (result.pHLevel >= sensorDataThresholds.pHLevelCaution[0] && result.pHLevel < sensorDataThresholds.pHLevelIdeal[0]) ||
                          (result.dissolvedOxygen >= sensorDataThresholds.dissolvedOxygenCaution[0] && result.dissolvedOxygen < sensorDataThresholds.dissolvedOxygenIdeal) ||
                          (result.turbidity > sensorDataThresholds.turbidityIdeal && result.turbidity <= sensorDataThresholds.turbidityCaution[1]) ||
                          (result.nitrate > sensorDataThresholds.nitrateIdeal && result.nitrate <= sensorDataThresholds.nitrateCaution[1])
                      );
                      const isPrediction = result.isPrediction === true;
                       // Threatening is when isSuitable is false AND it's not just a warning
                      const isThreatening = result.isSuitable === false && !isWarning;


                      let suitabilityClass = '';
                      let suitabilityText = '';
                      if (isPrediction) {
                        suitabilityClass = 'bg-gray-200 text-gray-800'; // Distinct style for predictions
                        suitabilityText = 'Prediction';
                      } else if (isIdeal) {
                        suitabilityClass = 'bg-green-200 text-green-800';
                        suitabilityText = 'Suitable';
                      } else if (isWarning) {
                        suitabilityClass = 'bg-yellow-200 text-yellow-800';
                        suitabilityText = 'Warning';
                      } else { // Must be Threatening
                        suitabilityClass = 'bg-red-200 text-red-800';
                        suitabilityText = 'Threatening';
                      }


                    return (
                      <TableRow key={index} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <TableCell className="py-2 border-r border-border px-3">{result.time}</TableCell>
                        <TableCell className="py-2 border-r border-border px-3">{result.location}</TableCell>
                        <TableCell className={`py-2 text-center border-r border-border px-3`}>
                           <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${suitabilityClass}`}>
                                {suitabilityText} {result.suitabilityIndex !== undefined ? `(${result.suitabilityIndex.toFixed(0)})` : ''}
                            </span>
                        </TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.waterTemperature.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.salinity.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.pHLevel.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.dissolvedOxygen.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.turbidity.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border px-3">{result.nitrate.toFixed(2)}</TableCell>
                        <TableCell className="py-2 border-r border-border px-3">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value="item-1" className="border-b-0">
                                <AccordionTrigger className="py-1 text-xs hover:no-underline">View</AccordionTrigger>
                                <AccordionContent className="text-xs">
                                  {result.summary || 'N/A'}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                        </TableCell>
                         <TableCell className="py-2 px-3">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value="item-1" className="border-b-0">
                                <AccordionTrigger className="py-1 text-xs hover:no-underline">View Actions</AccordionTrigger>
                                <AccordionContent>
                                   <ul className="list-disc pl-5 text-xs space-y-1">
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
            </CardContent>
          </Card>
      )}

        {analysisResults.length > 0 && (
            <Accordion type="multiple" className="w-full space-y-4">
                {parameters.map((parameter) => (
                    <AccordionItem value={parameter.key} key={parameter.key}>
                        <AccordionTrigger className="text-lg font-medium bg-card p-4 rounded-md shadow hover:bg-muted/50">
                             {parameter.name} Over Time
                         </AccordionTrigger>
                         <AccordionContent className="bg-card p-4 rounded-b-md">
                            <p className="text-sm text-muted-foreground mb-4">
                                Trends of {parameter.name} over time, including predictions.
                            </p>
                            <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart
                                      data={analysisResults} // Use combined results
                                      margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                                    >
                                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" tick={{fontSize: 12}} />
                                      <YAxis stroke="hsl(var(--foreground))" tick={{fontSize: 12}} domain={['auto', 'auto']} />
                                       <RechartsTooltip
                                            content={<ChartTooltipContent indicator="dot" />}
                                             cursor={{ stroke: "hsl(var(--accent))", strokeWidth: 1, strokeDasharray: "3 3"}}
                                             wrapperStyle={{ outline: "none", boxShadow: "0px 2px 8px rgba(0,0,0,0.15)", borderRadius: "0.5rem", backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))"}}
                                        />
                                      <RechartsLegend content={<ChartLegendContent />} />
                                      {/* Line for actual data */}
                                      <Line
                                        dataKey={(payload: AnalysisResult) => payload.isPrediction ? null : payload[parameter.key as keyof AnalysisResult]} // Only plot non-predictions
                                        type="monotone"
                                        stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use color from chartConfig
                                        strokeWidth={2}
                                        dot={(props) => {
                                            const { cx, cy, payload } = props;
                                             // Don't render dots for prediction points on the actual data line
                                            if (!payload.isPrediction) {
                                                 const color = chartConfig[parameter.key]?.color || '#8884d8';
                                                return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} strokeWidth={1} />;
                                            }
                                            return null;
                                        }}
                                         activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--primary))" }}
                                        name={parameter.name}
                                        connectNulls={false} // Do not connect across prediction gaps
                                        isAnimationActive={false}
                                      />
                                       {/* Line segment specifically for predictions */}
                                       <Line
                                            dataKey={(payload: AnalysisResult) => payload.isPrediction ? payload[parameter.key as keyof AnalysisResult] : null} // Only plot predictions
                                            stroke={chartConfig[parameter.key]?.color || '#8884d8'} // Use same base color
                                            strokeWidth={2}
                                            strokeDasharray="5 5" // Dashed line for predictions
                                            dot={(props) => {
                                                const { cx, cy, payload } = props;
                                                // Only render dots for prediction points
                                                if (payload.isPrediction) {
                                                    const color = chartConfig[parameter.key]?.color || '#8884d8';
                                                    return <circle cx={cx} cy={cy} r={3} fill={color} stroke={color} strokeWidth={1} />;
                                                }
                                                return null;
                                            }}
                                            activeDot={false} // No active dot effect for prediction line segment
                                            connectNulls={false} // Do not connect nulls (predictions start after actual data)
                                            name={`${parameter.name} (Prediction)`}
                                            // legendType="none" // Optionally hide from legend if desired
                                            isAnimationActive={false}
                                         />

                                    </LineChart>
                                </ResponsiveContainer>
                            </ChartContainer>
                         </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        )}

      {analysisResults.length > 0 && (
          <Card className="mt-8 bg-card shadow-md rounded-md">
            <CardHeader>
                <CardTitle>Parameter Ranges for Coral Health</CardTitle>
            </CardHeader>
            <CardContent>
                 <Accordion type="multiple" className="w-full space-y-2">
                    <AccordionItem value="ideal">
                      <AccordionTrigger className="text-green-700 font-medium">Ideal Ranges</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground pl-4">
                        <ul className="list-disc space-y-1">
                            <li>Water Temperature: 24-28 °C</li>
                            <li>Salinity: 33-36 PSU</li>
                            <li>pH Level: 8.0-8.3</li>
                            <li>Dissolved Oxygen: Greater than 6.0 mg/L</li>
                            <li>Turbidity: Below 1.0 NTU</li>
                            <li>Nitrate: Less than 0.1 mg/L</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="caution">
                      <AccordionTrigger className="text-yellow-700 font-medium">Cautionary Ranges (Warning)</AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground pl-4">
                         <ul className="list-disc space-y-1">
                            <li>Water Temperature: 28-30 °C</li>
                            <li>Salinity: 31-33 or 36-38 PSU</li>
                            <li>pH Level: 7.8-8.0</li>
                            <li>Dissolved Oxygen: 4.0-6.0 mg/L</li>
                            <li>Turbidity: 1.0-3.0 NTU</li>
                            <li>Nitrate: 0.1-0.3 mg/L</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                     <AccordionItem value="threatening">
                      <AccordionTrigger className="text-red-700 font-medium">Threatening Conditions</AccordionTrigger>
                       <AccordionContent className="text-sm text-muted-foreground pl-4">
                         <ul className="list-disc space-y-1">
                            <li>Water Temperature: Above 30°C poses a high bleaching risk.</li>
                            <li>Salinity: Below 31 or Above 38 PSU is dangerous.</li>
                            <li>pH Level: Below 7.8 indicates significant acidification stress.</li>
                            <li>Dissolved Oxygen: Below 4.0 mg/L can cause hypoxia leading to coral death.</li>
                            <li>Turbidity: Above 3.0 NTU significantly stresses corals.</li>
                            <li>Nitrate: Above 0.3 mg/L can cause algal blooms that suffocate coral reefs.</li>
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                 </Accordion>
            </CardContent>
          </Card>
      )}

      </div>
    </div>
  );
}
