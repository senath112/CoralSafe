"use client";

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as tf from '@tensorflow/tfjs';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import jsPDF from 'jspdf';
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
  threateningFactors: string;
  suggestedActions: string;
  waterTemperatureStatus: 'ideal' | 'caution' | 'highRisk';
  salinityStatus: 'ideal' | 'caution' | 'dangerous';
  pHLevelStatus: 'ideal' | 'concerning' | 'acidification';
  dissolvedOxygenStatus: 'ideal' | 'warning' | 'hypoxia';
  turbidityStatus: 'ideal' | 'reducedLight' | 'stressed';
  nitrateStatus: 'ideal' | 'manageable' | 'suffocating';
}

const THEME_CONFIG = {
  waterTemperature: {
    label: 'Water Temperature (°C)',
    color: 'hsl(var(--chart-1))',
  },
  salinity: {
    label: 'Salinity (PSU)',
    color: 'hsl(var(--chart-2))',
  },
  pHLevel: {
    label: 'pH Level',
    color: 'hsl(var(--chart-3))',
  },
  dissolvedOxygen: {
    label: 'Dissolved Oxygen (mg/L)',
    color: 'hsl(var(--chart-4))',
  },
  turbidity: {
    label: 'Turbidity (NTU)',
    color: 'hsl(var(--chart-5))',
  },
  nitrate: {
    label: 'Nitrate (mg/L)',
    color: 'hsl(var(--accent))',
  },
}

const PARAMETER_STATUS_MAP = {
  waterTemperature: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    caution: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    highRisk: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
  salinity: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    caution: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    dangerous: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
  pHLevel: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    concerning: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    acidification: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
  dissolvedOxygen: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    warning: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    hypoxia: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
  turbidity: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    reducedLight: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    stressed: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
  nitrate: {
    ideal: 'bg-green-100 text-green-500 rounded-full px-2 py-1',
    manageable: 'bg-yellow-100 text-yellow-500 rounded-full px-2 py-1',
    suffocating: 'bg-red-100 text-red-500 rounded-full px-2 py-1',
  },
};

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

export default function Home() {
  const [sensorData, setSensorData] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [model, setModel] = useState<tf.Sequential | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const reportRef = useRef<HTMLDivElement>(null); // Ref for the report section

  const analyzeData = useCallback(async () => {
    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]); // Clear previous results
    try {
      const parsedData = parseData(sensorData);
      if (!parsedData || parsedData.length === 0) {
        alert('No valid sensor data found. Please check the format.');
        setIsLoading(false);
        return;
      }

      const trainedModel = await trainModel(parsedData);
      setModel(trainedModel);

      const predictedData = await predictData(trainedModel, parsedData);
      const totalSteps = predictedData.length;

      const detailedAnalysis = await Promise.all(
        predictedData.map(async (data, index) => {
          const {
            isSuitable,
            threateningFactors,
            suggestedActions,
            waterTemperatureStatus,
            salinityStatus,
            pHLevelStatus,
            dissolvedOxygenStatus,
            turbidityStatus,
            nitrateStatus,
          } = await analyzeSensorData(data);

          const progress = ((index + 1) / totalSteps) * 100;
          setAnalysisProgress(progress);

          return {
            ...data,
            isSuitable,
            threateningFactors,
            suggestedActions,
            waterTemperatureStatus,
            salinityStatus,
            pHLevelStatus,
            dissolvedOxygenStatus,
            turbidityStatus,
            nitrateStatus,
          };
        })
      );

      setAnalysisResults(detailedAnalysis);
    } catch (error) {
      console.error('Error during data analysis:', error);
      alert('An error occurred during data analysis. Please try again.');
    } finally {
      setIsLoading(false);
      setAnalysisProgress(0);
    }
  }, [sensorData]);

  const parseData = (data: string): SensorData[] | null => {
    return data.split('\n').slice(1).map(entry => { // Skip the header row
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length !== 8) {
        return null; // Skip incomplete entries
      }

      const [
        time,
        location,
        waterTemperatureStr,
        salinityStr,
        pHLevelStr,
        dissolvedOxygenStr,
        turbidityStr,
        nitrateStr
      ] = parts;

      const waterTemperature = parseFloat(waterTemperatureStr);
      const salinity = parseFloat(salinityStr);
      const pHLevel = parseFloat(pHLevelStr);
      const dissolvedOxygen = parseFloat(dissolvedOxygenStr);
      const turbidity = parseFloat(turbidityStr);
      const nitrate = parseFloat(nitrateStr);

      if (
        isNaN(waterTemperature) ||
        isNaN(salinity) ||
        isNaN(pHLevel) ||
        isNaN(dissolvedOxygen) ||
        isNaN(turbidity) ||
        isNaN(nitrate)
      ) {
        return null;
      }

      return {
        time,
        location,
        waterTemperature,
        salinity,
        pHLevel,
        dissolvedOxygen,
        turbidity,
        nitrate,
      };
    }).filter((item): item is SensorData => item !== null);
  };

  const trainModel = async (data: SensorData[]) => {
    const numRecords = data.length;
    const numFeatures = 6; // waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate

    // Prepare data for TensorFlow.js
    const temperatures = data.map(item => item.waterTemperature);
    const salinity = data.map(item => item.salinity);
    const phLevels = data.map(item => item.pHLevel);
    const dissolvedOxygen = data.map(item => item.dissolvedOxygen);
    const turbidity = data.map(item => item.turbidity);
    const nitrate = data.map(item => item.nitrate);

    const inputTensor = tf.tensor2d(
      [temperatures, salinity, phLevels, dissolvedOxygen, turbidity, nitrate],
      [numFeatures, numRecords],
    ).transpose();

    // Define a simple sequential model
    const model = tf.sequential();
    model.add(tf.layers.dense({units: 64, activation: 'relu', inputShape: [numFeatures]}));
    model.add(tf.layers.dense({units: 32, activation: 'relu'}));
    model.add(tf.layers.dense({units: numFeatures}));

    // Compile the model
    model.compile({optimizer: 'adam', loss: 'meanSquaredError'});

    // Train the model
    await model.fit(inputTensor, inputTensor, {epochs: 100});

    return model;
  };

  const predictData = async (model: tf.Sequential, initialData: SensorData[]): Promise<SensorData[]> => {
    let data = [...initialData]; // Start with initial data
    const numPredictions = 5;

    for (let i = 0; i < numPredictions; i++) {
      // Prepare the input tensor using all available data for the current prediction
      const currentDataForPrediction = data.map(record => [
        record.waterTemperature,
        record.salinity,
        record.pHLevel,
        record.dissolvedOxygen,
        record.turbidity,
        record.nitrate,
      ]);
      const inputTensor = tf.tensor2d(
        currentDataForPrediction,
        [data.length, 6]
      );

      // Generate predictions
      const predictions = model.predict(inputTensor) as tf.Tensor<tf.Rank.R2>;
      const predictedValues = await predictions.data();

      // Use the last prediction for the new record
      const lastPredictedIndex = (data.length - 1) * 6;
      const newRecord: SensorData = {
        time: `P${i + 1}`,
        location: data[0].location, // Use the location from the initial data
        waterTemperature: predictedValues[lastPredictedIndex + 0] + (Math.random() - 0.5) * 0.1,
        salinity: predictedValues[lastPredictedIndex + 1] + (Math.random() - 0.5) * 0.1,
        pHLevel: predictedValues[lastPredictedIndex + 2] + (Math.random() - 0.5) * 0.01,
        dissolvedOxygen: predictedValues[lastPredictedIndex + 3] + (Math.random() - 0.5) * 0.1,
        turbidity: predictedValues[lastPredictedIndex + 4] + (Math.random() - 0.5) * 0.05,
        nitrate: predictedValues[lastPredictedIndex + 5] + (Math.random() - 0.5) * 0.01,
      };

      data.push(newRecord); // Add the new record to the data array
    }

    return data;
  };

  const defineSensorDataThresholds = () => ({
    temperatureIdeal: [24, 28],
    temperatureCaution: [28, 30],
    salinityIdeal: [33, 36],
    salinityCaution: [31, 33, 36, 38],
    pHLevelIdeal: [8.0, 8.3],
    pHLevelCaution: [7.8, 8.0],
    dissolvedOxygenIdeal: 6.0,
    dissolvedOxygenCaution: [4.0, 6.0],
    turbidityIdeal: 1.0,
    turbidityCaution: [1.0, 3.0],
    nitrateIdeal: 0.1,
    nitrateCaution: [0.1, 0.3],
  });

  const analyzeSensorData = async (data: SensorData) => {
    const thresholds = defineSensorDataThresholds();

    const waterTemperatureStatus =
      data.waterTemperature >= thresholds.temperatureIdeal[0] && data.waterTemperature <= thresholds.temperatureIdeal[1]
        ? 'ideal'
        : data.waterTemperature >= thresholds.temperatureCaution[0] && data.waterTemperature <= thresholds.temperatureCaution[1]
          ? 'caution'
          : 'highRisk';

    const salinityStatus =
      data.salinity >= thresholds.salinityIdeal[0] && data.salinity <= thresholds.salinityIdeal[1]
        ? 'ideal'
        : (data.salinity >= thresholds.salinityCaution[0] && data.salinity < thresholds.salinityIdeal[0]) ||
          (data.salinity > thresholds.salinityIdeal[1] && data.salinity <= thresholds.salinityCaution[3])
          ? 'caution'
          : 'dangerous';

    const pHLevelStatus =
      data.pHLevel >= thresholds.pHLevelIdeal[0] && data.pHLevel <= thresholds.pHLevelIdeal[1]
        ? 'ideal'
        : data.pHLevel >= thresholds.pHLevelCaution[0] && data.pHLevel < thresholds.pHLevelIdeal[0]
          ? 'concerning'
          : 'acidification';

    const dissolvedOxygenStatus =
      data.dissolvedOxygen > thresholds.dissolvedOxygenIdeal
        ? 'ideal'
        : data.dissolvedOxygen >= thresholds.dissolvedOxygenCaution[0] && data.dissolvedOxygen <= thresholds.dissolvedOxygenCaution[1]
          ? 'warning'
          : 'hypoxia';

    const turbidityStatus =
      data.turbidity < thresholds.turbidityIdeal
        ? 'ideal'
        : data.turbidity >= thresholds.turbidityCaution[0] && data.turbidity <= thresholds.turbidityCaution[1]
          ? 'reducedLight'
          : 'stressed';

    const nitrateStatus =
      data.nitrate < thresholds.nitrateIdeal
        ? 'ideal'
        : data.nitrate >= thresholds.nitrateCaution[0] && data.nitrate <= thresholds.nitrateCaution[1]
          ? 'manageable'
          : 'suffocating';

    let threateningFactors = '';
    if (waterTemperatureStatus === 'highRisk') threateningFactors += 'High water temperature, ';
    if (salinityStatus === 'dangerous') threateningFactors += 'Dangerous salinity levels, ';
    if (pHLevelStatus === 'acidification') threateningFactors += 'Acidification stress, ';
    if (dissolvedOxygenStatus === 'hypoxia') threateningFactors += 'Hypoxia (low dissolved oxygen), ';
    if (turbidityStatus === 'stressed') threateningFactors += 'High turbidity, ';
    if (nitrateStatus === 'suffocating') threateningFactors += 'High nitrate concentrations, ';

    // Include caution levels as threatening if they are outside ideal range
    if (waterTemperatureStatus === 'caution') threateningFactors += 'Caution: Water temperature outside ideal range, ';
    if (salinityStatus === 'caution') threateningFactors += 'Caution: Salinity outside ideal range, ';
    if (pHLevelStatus === 'concerning') threateningFactors += 'Caution: pH Level outside ideal range, ';
    if (dissolvedOxygenStatus === 'warning') threateningFactors += 'Caution: Dissolved Oxygen outside ideal range, ';
    if (turbidityStatus === 'reducedLight') threateningFactors += 'Caution: Turbidity outside ideal range, ';
    if (nitrateStatus === 'manageable') threateningFactors += 'Caution: Nitrate concentration outside ideal range, ';


    if (threateningFactors === '') {
      threateningFactors = 'None';
    } else {
      threateningFactors = threateningFactors.slice(0, -2); // Remove trailing comma and space
    }

    const defaultActions = {
      highRisk: 'Reduce thermal stress by providing shade or cooling the water. Consider relocating corals to a cooler environment.',
      dangerous: 'Adjust salinity by controlling freshwater input or increasing water circulation. Implement desalination or dilute with ocean water.',
      acidification: 'Introduce buffering agents to increase pH. Reduce CO2 emissions and local pollution sources.',
      hypoxia: 'Aerate the water or increase oxygen production through planting aquatic vegetation. Reduce organic waste input.',
      stressed: 'Reduce sediment input from construction, dredging, and agriculture. Use silt curtains and erosion control measures.',
      suffocating: 'Control nutrient runoff from agriculture and sewage. Implement advanced wastewater treatment and reduce fertilizer use.',
      caution: 'Monitor closely and address potential sources of stress.' // Generic action for caution levels
    };

    let suggestedActions = '';
    if (waterTemperatureStatus === 'highRisk') suggestedActions += defaultActions.highRisk + ' ';
    else if (waterTemperatureStatus === 'caution') suggestedActions += defaultActions.caution + ' ';

    if (salinityStatus === 'dangerous') suggestedActions += defaultActions.dangerous + ' ';
    else if (salinityStatus === 'caution') suggestedActions += defaultActions.caution + ' ';

    if (pHLevelStatus === 'acidification') suggestedActions += defaultActions.acidification + ' ';
    else if (pHLevelStatus === 'concerning') suggestedActions += defaultActions.caution + ' ';

    if (dissolvedOxygenStatus === 'hypoxia') suggestedActions += defaultActions.hypoxia + ' ';
    else if (dissolvedOxygenStatus === 'warning') suggestedActions += defaultActions.caution + ' ';

    if (turbidityStatus === 'stressed') suggestedActions += defaultActions.stressed + ' ';
    else if (turbidityStatus === 'reducedLight') suggestedActions += defaultActions.caution + ' ';

    if (nitrateStatus === 'suffocating') suggestedActions += defaultActions.suffocating + ' ';
    else if (nitrateStatus === 'manageable') suggestedActions += defaultActions.caution + ' ';


    const isSuitable =
      waterTemperatureStatus === 'ideal' &&
      salinityStatus === 'ideal' &&
      pHLevelStatus === 'ideal' &&
      dissolvedOxygenStatus === 'ideal' &&
      turbidityStatus === 'ideal' &&
      nitrateStatus === 'ideal';


    return {
      isSuitable,
      threateningFactors,
      suggestedActions,
      waterTemperatureStatus,
      salinityStatus,
      pHLevelStatus,
      dissolvedOxygenStatus,
      turbidityStatus,
      nitrateStatus,
    };
  };

  const downloadPDF = async () => {
    const reportElement = reportRef.current;
    if (!reportElement) {
      console.error("Report element not found");
      return;
    }
    setIsDownloading(true);

    try {
      const canvas = await html2canvas(reportElement, { scale: 2 }); // Increase scale for better quality
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10; // Add some margin from the top

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save('coralsafe_report.pdf');
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF report.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div ref={reportRef} className="max-w-5xl w-full space-y-8"> {/* Add ref here */}
        <Card className="bg-card shadow-md rounded-md">
          <CardHeader>
             <div className="flex items-center space-x-4">
              <Avatar>
                <AvatarImage
                  src="https://picsum.photos/50/50"
                  alt="CoralSafe Logo"
                  className="mr-2 rounded-full"
                />
                <AvatarFallback>CS</AvatarFallback>
              </Avatar>
              <span>CoralSafe: Sensor Data Analyzer</span>
            </div>
          </CardHeader>
          <CardContent>
              <p className="font-medium mb-1">Sensor Data Input</p>
              <p className="text-sm text-muted-foreground mb-2">Format: Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L</p>
            <Textarea
              placeholder="Paste sensor data here"
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
              className="mb-4"
            />
             <div className="flex space-x-2">
              <Button onClick={analyzeData} disabled={isLoading || isDownloading}>
                {isLoading ? 'Analyzing...' : 'Analyze Sensor Data'}
              </Button>
              {analysisResults.length > 0 && (
                <Button onClick={downloadPDF} disabled={isLoading || isDownloading}>
                  {isDownloading ? 'Downloading...' : 'Download Report (PDF)'}
                </Button>
              )}
            </div>
            {isLoading && (
              <Alert variant="default" className="mt-4">
                <AlertTitle>Analyzing Data...</AlertTitle>
                <AlertDescription>
                  Progress: {analysisProgress.toFixed(0)}%
                  <Progress value={analysisProgress} className="mt-1" />
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {analysisResults.length > 0 && (
          <Card className="bg-card shadow-md rounded-md">
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>
                This table presents a detailed analysis of sensor data, providing insights into coral reef suitability and suggested actions for improvement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="rounded-md shadow-md border">
                <TableHeader>
                  <TableRow className="border-b">
                    <TableHead className="text-left font-medium border-r">Time</TableHead>
                    <TableHead className="text-left font-medium border-r">Location</TableHead>
                    <TableHead className="text-left font-medium border-r">Suitability</TableHead>
                    <TableHead className="text-left font-medium border-r">Water Temperature (°C)</TableHead>
                    <TableHead className="text-left font-medium border-r">Salinity (PSU)</TableHead>
                    <TableHead className="text-left font-medium border-r">pH Level</TableHead>
                    <TableHead className="text-left font-medium border-r">Dissolved Oxygen (mg/L)</TableHead>
                    <TableHead className="text-left font-medium border-r">Turbidity (NTU)</TableHead>
                    <TableHead className="text-left font-medium border-r">Nitrate (mg/L)</TableHead>
                    <TableHead className="text-left font-medium">Improvements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => (
                    <TableRow key={index} className="border-b">
                      <TableCell className="py-2 border-r">{result.time}</TableCell>
                      <TableCell className="py-2 border-r">{result.location}</TableCell>
                      <TableCell className="py-2 border-r">
                        {result.isSuitable === null ? (
                          <span className="text-gray-500">Analyzing...</span>
                        ) : result.isSuitable ? (
                           <span className="bg-green-100 text-green-600 rounded-full px-2 py-1">Suitable</span>
                        ) : (
                          <span className="bg-red-100 text-red-600 rounded-full px-2 py-1">Threatening</span>
                        )}
                      </TableCell>
                      <TableCell className="py-2 border-r">
                        <span className={PARAMETER_STATUS_MAP.waterTemperature[result.waterTemperatureStatus as keyof typeof PARAMETER_STATUS_MAP.waterTemperature]}>
                          {result.waterTemperature.toFixed(2)} ({result.waterTemperatureStatus})
                        </span>
                      </TableCell>
                      <TableCell className="py-2 border-r">
                        <span className={PARAMETER_STATUS_MAP.salinity[result.salinityStatus as keyof typeof PARAMETER_STATUS_MAP.salinity]}>
                          {result.salinity.toFixed(2)} ({result.salinityStatus})
                        </span>
                      </TableCell>
                      <TableCell className="py-2 border-r">
                        <span className={PARAMETER_STATUS_MAP.pHLevel[result.pHLevelStatus as keyof typeof PARAMETER_STATUS_MAP.pHLevel]}>
                          {result.pHLevel.toFixed(2)} ({result.pHLevelStatus})
                        </span>
                      </TableCell>
                       <TableCell className="py-2 border-r">
                        <span className={PARAMETER_STATUS_MAP.dissolvedOxygen[result.dissolvedOxygenStatus as keyof typeof PARAMETER_STATUS_MAP.dissolvedOxygen]}>
                          {result.dissolvedOxygen.toFixed(2)} ({result.dissolvedOxygenStatus})
                        </span>
                      </TableCell>
                      <TableCell className="py-2 border-r">
                         <span className={PARAMETER_STATUS_MAP.turbidity[result.turbidityStatus as keyof typeof PARAMETER_STATUS_MAP.turbidity]}>
                          {result.turbidity.toFixed(2)} ({result.turbidityStatus})
                         </span>
                      </TableCell>
                      <TableCell className="py-2 border-r">
                        <span className={PARAMETER_STATUS_MAP.nitrate[result.nitrateStatus as keyof typeof PARAMETER_STATUS_MAP.nitrate]}>
                          {result.nitrate.toFixed(2)} ({result.nitrateStatus})
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`item-${index}`}>
                            <AccordionTrigger className="text-sm">Details</AccordionTrigger>
                            <AccordionContent>
                              <div className="text-xs">
                                <p><strong>Threatening Factors:</strong> {result.threateningFactors || 'None'}</p>
                                <p><strong>Suggested Actions:</strong> {result.suggestedActions || 'None'}</p>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {analysisResults.length > 0 && Object.keys(THEME_CONFIG).map((name) => (
          <Accordion key={name} type="single" collapsible className="w-full">
            <AccordionItem value={name}>
              <Card className="bg-card shadow-md rounded-md">
                <AccordionTrigger className="w-full px-6 py-4">
                   <CardHeader className="p-0 text-left">
                     <CardTitle>{THEME_CONFIG[name as keyof typeof THEME_CONFIG].label} Over Time</CardTitle>
                     <CardDescription>
                       Trends of {THEME_CONFIG[name as keyof typeof THEME_CONFIG].label} over time, including predictions.
                     </CardDescription>
                   </CardHeader>
                </AccordionTrigger>
                <AccordionContent>
                  <CardContent className="pt-0">
                    <ChartContainer config={THEME_CONFIG}>
                      <ResponsiveContainer width="100%" height={400}>
                        <LineChart data={analysisResults}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="time" />
                          <YAxis />
                          <Tooltip content={<ChartTooltipContent />} />
                          <Legend content={<ChartLegendContent />} />
                           {/* Original data line */}
                          <Line
                            type="monotone"
                            dataKey={name}
                            stroke={THEME_CONFIG[name as keyof typeof THEME_CONFIG].color}
                            name={THEME_CONFIG[name as keyof typeof THEME_CONFIG].label}
                            dot={true} // Show dots for original data
                            connectNulls={false} // Do not connect line over prediction gap
                          />
                          {/* Predicted data line - rendered differently */}
                          <Line
                            type="monotone"
                            dataKey={name}
                            stroke={THEME_CONFIG[name as keyof typeof THEME_CONFIG].color}
                            strokeDasharray="5 5" // Dashed line for prediction
                            name={`${THEME_CONFIG[name as keyof typeof THEME_CONFIG].label} (Predicted)`}
                            dot={{ stroke: THEME_CONFIG[name as keyof typeof THEME_CONFIG].color, strokeWidth: 1, r: 4, fill: '#fff' }} // Style predicted points
                            connectNulls={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartContainer>
                  </CardContent>
                </AccordionContent>
              </Card>
            </AccordionItem>
          </Accordion>
        ))}
      </div>
    </div>
  );
}
