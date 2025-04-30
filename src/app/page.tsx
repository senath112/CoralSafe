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
  nitrate: {label: "Nitrate (mg/L)", color: "hsl(var(--chart-1))"}, // Reusing chart color for example
  prediction: {label: "Prediction", color: "hsl(var(--muted-foreground))", icon: () => <path d="M3 3v18h18" fill="none" strokeDasharray="2,2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="stroke-muted-foreground"/>}, // Example prediction style
} satisfies ChartConfig;

export default function Home() {
  const [sensorData, setSensorData] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [model, setModel] = useState<tf.Sequential | null>(null);
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
    // Splitting by newline to separate entries
    const lines = data.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const header = lines[0].split(',').map(item => item.trim());
    const expectedHeaders = ['Date', 'Location', 'Water_Temperature_C', 'Salinity_PSU', 'pH_Level', 'Dissolved_Oxygen_mg_L', 'Turbidity_NTU', 'Nitrate_mg_L'];

    // Basic header check
    if (JSON.stringify(header) !== JSON.stringify(expectedHeaders)) {
        console.warn("CSV header doesn't match expected format. Proceeding, but results might be inaccurate.");
    }


    return lines.slice(1).map(entry => { // Skip the header row
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length !== expectedHeaders.length) {
         console.warn(`Skipping incomplete or malformed entry: ${entry}`);
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
         console.warn(`Skipping entry with invalid numeric values: ${entry}`);
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
  };

  const trainModel = async (data: SensorData[]) => {
    if (data.length === 0) return null; // No data to train on

    const numRecords = data.length;
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


    const inputTensor = tf.tensor2d(features, [numRecords, numFeatures]);


    // Define a simple sequential model
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 64, activation: 'relu', inputShape: [numFeatures]}));
    model.add(tf.layers.dense({units: 32, activation: 'relu'}));
    model.add(tf.layers.dense({units: numFeatures})); // Output layer with numFeatures units

    // Compile the model
    model.compile({optimizer: 'adam', loss: 'meanSquaredError'});

    // Train the model
    // Using inputTensor as both input and target for demonstration (e.g., autoencoder-like)
    // For time series prediction, you'd typically use sequences (e.g., predict next step based on previous steps)
    try {
        await model.fit(inputTensor, inputTensor, {
            epochs: 100,
            callbacks: {
                onEpochEnd: (epoch, logs) => {
                    // Optional: Log progress or update UI during training
                    // console.log(`Epoch ${epoch + 1}: loss = ${logs?.loss}`);
                }
            }
        });
        console.log("Model training completed.");
        return model;
    } catch (error) {
        console.error("Error during model training:", error);
        toast({
            title: "Model Training Error",
            description: "An error occurred while training the prediction model.",
            variant: "destructive",
        });
        return null;
    } finally {
        tf.dispose([inputTensor]); // Dispose tensor to free memory
    }
  };


 const analyzeData = async () => {
    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]); // Clear previous results
    csvDataRef.current = sensorData; // Store raw CSV data if needed

    try {
        const parsedData = parseData(sensorData);
        if (!parsedData || parsedData.length === 0) {
            toast({
                title: 'Error',
                description: 'No valid data found or data format is incorrect. Please check your input.',
                variant: 'destructive',
            });
            setIsLoading(false);
            return;
        }

        // Train the model first
        const trainedModel = await trainModel(parsedData);
        setModel(trainedModel); // Save the trained model

        // Process each data point for suitability analysis
        const detailedResults: AnalysisResult[] = parsedData.map((data, index) => {
            const {isSuitable, summary, threateningFactors} = analyzeSensorData(
                data,
                sensorDataThresholds
            );
            const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);

            let improvements: string[] = [];
             if (!isSuitable) {
                // Generate improvements based on threatening factors
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
                    improvements = ["Consider general water quality improvements."]; // Fallback if no specific factors identified
                 }
            } else {
                 improvements = ["Environment appears suitable, continue monitoring."];
            }


            // Update progress (can be more sophisticated)
            setAnalysisProgress(((index + 1) / parsedData.length) * 50); // 50% for analysis

            return {
                ...data,
                isSuitable,
                summary,
                improvements,
                suitabilityIndex,
                isPrediction: false,
            };
        });

        // Perform predictions only if the model was trained successfully
        if (trainedModel) {
            const numPredictions = 5;
            let currentInputData = parsedData[parsedData.length - 1]; // Start prediction from the last actual data point
            let allDataForPrediction = [...parsedData]; // Includes historical data

            for (let i = 0; i < numPredictions; i++) {
                 // Prepare input for prediction using the relevant historical window
                 const featuresToPredict = [
                    currentInputData.waterTemperature,
                    currentInputData.salinity,
                    currentInputData.pHLevel,
                    currentInputData.dissolvedOxygen,
                    currentInputData.turbidity,
                    currentInputData.nitrate,
                 ];
                 const inputTensor = tf.tensor2d([featuresToPredict], [1, 6]);


                // Generate prediction
                 const predictionTensor = trainedModel.predict(inputTensor) as tf.Tensor<tf.Rank.R2>;
                 const predictedValues = await predictionTensor.data();
                 tf.dispose([inputTensor, predictionTensor]); // Dispose tensors


                // Create the prediction result object
                const predictionTime = `P${i + 1}`;
                const predictedResult: AnalysisResult = {
                    time: predictionTime,
                    location: currentInputData.location, // Assume same location for predictions
                    waterTemperature: predictedValues[0] + (Math.random() - 0.5) * 0.1, // Add slight variation
                    salinity: predictedValues[1] + (Math.random() - 0.5) * 0.1,
                    pHLevel: predictedValues[2] + (Math.random() - 0.5) * 0.01,
                    dissolvedOxygen: predictedValues[3] + (Math.random() - 0.5) * 0.1,
                    turbidity: predictedValues[4] + (Math.random() - 0.5) * 0.05,
                    nitrate: predictedValues[5] + (Math.random() - 0.5) * 0.01,
                    isSuitable: null, // Suitability is not determined for predictions
                    summary: 'Prediction',
                    improvements: [],
                    suitabilityIndex: undefined,
                    isPrediction: true,
                };

                detailedResults.push(predictedResult);

                 // Update currentInputData for the next prediction step
                 // This makes the next prediction depend on the previous one
                 currentInputData = { ...currentInputData, ...predictedResult };
                 allDataForPrediction.push(currentInputData); // Add prediction to data used for next step if needed by model logic

                // Update progress
                setAnalysisProgress(50 + ((i + 1) / numPredictions) * 50); // 50% for predictions
            }
        } else {
             setAnalysisProgress(100); // If no model, progress is complete after analysis
             toast({
                 title: "Prediction Skipped",
                 description: "Model training failed, skipping predictions.",
                 variant: "destructive", // Or "default" if just informational
             });
        }


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
        setIsLoading(false);
        setAnalysisProgress(100); // Ensure progress completes
    }
};


  return (
    <div id="report" className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-5xl w-full space-y-8">
        <Card>
          <CardHeader>
             <div className="flex items-center">
                 <Avatar>
                   <AvatarImage src="https://picsum.photos/50/50" alt="CoralSafe Logo" className="mr-2 rounded-full"/>
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
              onChange={(e) => setSensorData(e.target.value)}
              className="min-h-[150px] text-sm p-3 border rounded-md shadow-inner focus:ring-accent focus:border-accent"
            />
            <Button
              onClick={analyzeData}
              disabled={isLoading || !sensorData.trim()}
              className="mt-4 w-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
          </CardContent>
        </Card>

      {isLoading && (
         <div className="w-full px-4">
             <Progress value={analysisProgress} className="w-full [&>div]:bg-accent" />
             <p className="text-center text-sm text-muted-foreground mt-2">Analyzing Data: {analysisProgress.toFixed(0)}%</p>
         </div>
      )}

      {analysisResults.length > 0 && (
          <Card>
            <CardHeader>
                <CardTitle>Analysis Results</CardTitle>
                <Button onClick={downloadReport} className="mt-2 bg-accent text-accent-foreground hover:bg-accent/90" size="sm">Download Report (PDF)</Button>
            </CardHeader>
            <CardContent>
              <Table className="rounded-md shadow-md border border-border">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left font-medium border-r border-border">Time</TableHead>
                    <TableHead className="text-left font-medium border-r border-border">Location</TableHead>
                    <TableHead className="text-center font-medium border-r border-border">Suitability</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">Water Temp (°C)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">Salinity (PSU)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">pH Level</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">Oxygen (mg/L)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">Turbidity (NTU)</TableHead>
                    <TableHead className="text-right font-medium border-r border-border">Nitrate (mg/L)</TableHead>
                    <TableHead className="text-left font-medium border-r border-border">Summary</TableHead>
                    <TableHead className="text-left font-medium">Suggested Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => {
                      const isIdeal = result.isSuitable === true;
                      const isWarning = result.isSuitable === false && (
                          (result.waterTemperature >= sensorDataThresholds.temperatureCaution[0] && result.waterTemperature <= sensorDataThresholds.temperatureCaution[1]) ||
                          (result.salinity >= sensorDataThresholds.salinityCaution[0] && result.salinity <= sensorDataThresholds.salinityCaution[1]) || (result.salinity >= sensorDataThresholds.salinityCaution[2] && result.salinity <= sensorDataThresholds.salinityCaution[3]) ||
                          (result.pHLevel >= sensorDataThresholds.pHLevelCaution[0] && result.pHLevel <= sensorDataThresholds.pHLevelCaution[1]) ||
                          (result.dissolvedOxygen >= sensorDataThresholds.dissolvedOxygenCaution[0] && result.dissolvedOxygen <= sensorDataThresholds.dissolvedOxygenCaution[1]) ||
                          (result.turbidity >= sensorDataThresholds.turbidityCaution[0] && result.turbidity <= sensorDataThresholds.turbidityCaution[1]) ||
                          (result.nitrate >= sensorDataThresholds.nitrateCaution[0] && result.nitrate <= sensorDataThresholds.nitrateCaution[1])
                      );
                      const isPrediction = result.isSuitable === null;
                      const isThreatening = !isIdeal && !isWarning && !isPrediction;


                      let suitabilityClass = '';
                      let suitabilityText = '';
                      if (isPrediction) {
                        suitabilityClass = 'bg-gray-200 text-gray-800'; // Or another distinct style
                        suitabilityText = 'Prediction';
                      } else if (isIdeal) {
                        suitabilityClass = 'bg-green-200 text-green-800';
                        suitabilityText = 'Suitable';
                      } else if (isWarning) {
                        suitabilityClass = 'bg-yellow-200 text-yellow-800';
                        suitabilityText = 'Warning';
                      } else { // Threatening
                        suitabilityClass = 'bg-red-200 text-red-800';
                        suitabilityText = 'Threatening';
                      }


                    return (
                      <TableRow key={index} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <TableCell className="py-2 border-r border-border">{result.time}</TableCell>
                        <TableCell className="py-2 border-r border-border">{result.location}</TableCell>
                        <TableCell className={`py-2 text-center border-r border-border`}>
                           <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${suitabilityClass}`}>
                                {suitabilityText} {result.suitabilityIndex !== undefined ? `(${result.suitabilityIndex.toFixed(0)})` : ''}
                            </span>
                        </TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.waterTemperature.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.salinity.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.pHLevel.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.dissolvedOxygen.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.turbidity.toFixed(2)}</TableCell>
                        <TableCell className="py-2 text-right border-r border-border">{result.nitrate.toFixed(2)}</TableCell>
                        <TableCell className="py-2 border-r border-border">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value="item-1" className="border-b-0">
                                <AccordionTrigger className="py-1 text-xs hover:no-underline">View</AccordionTrigger>
                                <AccordionContent className="text-xs">
                                  {result.summary || 'N/A'}
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                        </TableCell>
                         <TableCell className="py-2">
                            <Accordion type="single" collapsible className="w-full">
                              <AccordionItem value="item-1" className="border-b-0">
                                <AccordionTrigger className="py-1 text-xs hover:no-underline">View Actions</AccordionTrigger>
                                <AccordionContent>
                                   <ul className="list-disc pl-5 text-xs">
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
                                      data={analysisResults}
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
                                      <Line
                                        dataKey={parameter.key}
                                        type="monotone"
                                        stroke={`hsl(var(--chart-${parameters.findIndex(p => p.key === parameter.key) + 1}))`} // Cycle through chart colors
                                        strokeWidth={2}
                                        dot={{
                                            r: 3,
                                            fill: `hsl(var(--chart-${parameters.findIndex(p => p.key === parameter.key) + 1}))`,
                                            strokeWidth: 1,
                                            stroke: `hsl(var(--chart-${parameters.findIndex(p => p.key === parameter.key) + 1}))`
                                        }}
                                         activeDot={{ r: 5, fill: "hsl(var(--primary))", stroke: "hsl(var(--primary))" }}
                                        name={parameter.name}
                                        connectNulls // Connect lines even if there are null prediction points in between
                                        isAnimationActive={false} // Disable animation for performance with potentially many points
                                      />
                                       {/* Line segment specifically for predictions */}
                                       <Line
                                            dataKey={parameter.key}
                                            stroke={`hsl(var(--chart-${parameters.findIndex(p => p.key === parameter.key) + 1}))`} // Use same base color
                                            strokeWidth={2}
                                            strokeDasharray="5 5" // Dashed line for predictions
                                            dot={(props) => {
                                                const { cx, cy, payload } = props;
                                                // Only render dots for prediction points
                                                if (payload.isPrediction) {
                                                    return <circle cx={cx} cy={cy} r={3} fill={"hsl(var(--accent))"} stroke={"hsl(var(--accent))"} strokeWidth={1} />;
                                                }
                                                return null; // Don't render dots for non-prediction points on this line
                                            }}
                                            activeDot={false} // No active dot effect for prediction line segment
                                            connectNulls
                                            name={`${parameter.name} (Prediction)`}
                                            legendType="none" // Hide this segment from the default legend
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
