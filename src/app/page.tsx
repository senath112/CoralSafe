'use client';

import {useState, useCallback, useRef, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Avatar, AvatarImage, AvatarFallback} from '@/components/ui/avatar';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {defineSensorDataThresholds, analyzeSensorData, predictFutureReadings, calculateSuitabilityIndex} from '@/lib/utils';
import {Chart} from '@/components/Chart';
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
} from "@/components/ui/table"
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
  {name: 'Water Temperature', unit: '°C'},
  {name: 'Salinity', unit: 'PSU'},
  {name: 'pH Level', unit: ''},
  {name: 'Dissolved Oxygen', unit: 'mg/L'},
  {name: 'Turbidity', unit: 'NTU'},
  {name: 'Nitrate', unit: 'mg/L'},
];

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

  const parseData = (data: string) => {
    // Splitting by newline to separate entries
    return data.split('\n').slice(1).map(entry => { // Skip the header row
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length < 3) {
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
    }).filter(Boolean) as AnalysisResult[];
  };

  const trainModel = async (data: AnalysisResult[]) => {
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

  const analyzeData = async () => {
    setIsLoading(true);
    setAnalysisProgress(0);
    setAnalysisResults([]); // Clear previous results
    csvDataRef.current = sensorData;
    try {
      const parsedData = parseData(sensorData);
      if (!parsedData || parsedData.length === 0) {
        toast({
          title: 'Error',
          description: 'No valid data found. Please check your input.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      
      const trainedModel = await trainModel(parsedData);
      setModel(trainedModel);

      const detailedResults = parsedData.map((data, index) => {
        const {isSuitable, summary} = analyzeSensorData(
          data,
          sensorDataThresholds
        );
        const suitabilityIndex = calculateSuitabilityIndex(data, sensorDataThresholds);
        const improvements = isSuitable ? [] : ["No improvements suggested, the environment is suitable."];
        setAnalysisProgress((index + 1) / parsedData.length * 100);

        return {
          ...data,
          isSuitable,
          summary,
          improvements,
          suitabilityIndex,
        };
      });
      setAnalysisResults(detailedResults);

      // Predict future data points using TensorFlow.js model
      if (trainedModel && parsedData.length > 0) {
        const numPredictions = 5;
        let lastRecord = parsedData[parsedData.length - 1];
        let predictedChartData = [];

        for (let i = 0; i < numPredictions; i++) {
          // Prepare the input tensor using the last record's data
          const inputTensor = tf.tensor2d(
            [
              [
                lastRecord.waterTemperature,
                lastRecord.salinity,
                lastRecord.pHLevel,
                lastRecord.dissolvedOxygen,
                lastRecord.turbidity,
                lastRecord.nitrate,
              ],
            ],
            [1, 6]
          );

          // Generate predictions
          const predictions = trainedModel.predict(inputTensor) as tf.Tensor<tf.Rank.R2>;
          const predictedValues = await predictions.data();

          const predictionTime = `P${i + 1}`; // Predicted Time
          // Add slight variations to the predicted values
          const waterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1; // Adding -0.05 to 0.05 variation
          const salinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const pHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01; // Smaller variation for pH
          const dissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const turbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const nitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;
          predictedChartData.push({
            time: predictionTime,
            location: "Prediction",
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
            isSuitable: null, // Mark as prediction
          });

          // Update lastRecord for the next prediction
          lastRecord = {
            ...lastRecord,
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
          };
          detailedResults.push({
            time: predictionTime,
            location: "Prediction",
            waterTemperature: waterTemperature,
            salinity: salinity,
            pHLevel: pHLevel,
            dissolvedOxygen: dissolvedOxygen,
            turbidity: turbidity,
            nitrate: nitrate,
            isSuitable: null, // Mark as prediction
          });

          setAnalysisResults([...detailedResults]);
        }
      }
      toast({
        title: 'Success',
        description: 'Data analyzed successfully!',
      });
    } catch (error: any) {
      console.error('Error during analysis:', error);
      setToast({
        title: 'Error',
        description: 'An error occurred during the analysis. Please check the console for details.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    
      
        
          
            CoralSafe: Sensor Data Analyzer
          
        
        
          Sensor Data Input
          
          Format: Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L
        
        
          
            Paste sensor data here
          
        
        
          Analyze Data
        
      

      {isLoading && (
        
          Analyzing Data: {analysisProgress.toFixed(0)}%
          
        
      )}

      {analysisResults.length > 0 && (
        
          
            

              Time
              Location
              Suitability
              Water Temperature (°C)
              Salinity (PSU)
              pH Level
              Dissolved Oxygen (mg/L)
              Turbidity (NTU)
              Nitrate (mg/L)
              Summary
              Suggested Actions
            
          
          
            {analysisResults.map((result, index) => {
              const isIdeal = result.isSuitable === true;
              const isWarning = result.isSuitable === null;
              const isThreatening = result.isSuitable === false;

              let suitabilityColor = '';
              if (isIdeal) {
                suitabilityColor = 'bg-green-200';
              } else if (isWarning) {
                suitabilityColor = 'bg-yellow-200';
              } else if (isThreatening) {
                suitabilityColor = 'bg-red-200';
              }

              return (
                
                  
                    {result.time}
                  
                  
                    {result.location}
                  
                  
                    
                      {result.isSuitable === null
                        ? 'Prediction'
                        : result.isSuitable
                          ? 'Suitable'
                          : 'Threatening'}
                    
                  
                  
                    {result.waterTemperature}
                  
                  
                    {result.salinity}
                  
                  
                    {result.pHLevel}
                  
                  
                    {result.dissolvedOxygen}
                  
                  
                    {result.turbidity}
                  
                  
                    {result.nitrate}
                  
                  
                    {result.summary}
                  
                  
                    
                      {result.improvements?.map((improvement, i) => (
                        
                          • {improvement}
                        
                      ))}
                    
                  
                
              );
            })}
          
        
      )}
{analysisResults.length > 0 && (
        
          {parameters.map((parameter) => (
            
              
                {parameter.name} Over Time
              
              Trends of {parameter.name} over time, including predictions.
            
            
          ))}
        
      )}
      
        
          Ideal Ranges:
          
            Water Temperature: 24-28 °C
            Salinity: 33-36 PSU
            pH Level: 8.0-8.3
            Dissolved Oxygen: Greater than 6.0 mg/L
            Turbidity: Below 1.0 NTU
            Nitrate: Less than 0.1 mg/L
          
          Cautionary Ranges:
          
            Water Temperature: 28-30 °C
            Salinity: 31-33 or 36-38 PSU
            pH Level: 7.8-8.0
            Dissolved Oxygen: 4.0-6.0 mg/L
            Turbidity: 1.0-3.0 NTU
            Nitrate: 0.1-0.3 mg/L
          
          Threatening Conditions:
          
            Water Temperature: Above 30°C poses a high bleaching risk.
            Salinity: Below 31 or Above 38 PSU is dangerous.
            pH Level: Below 7.8 indicates significant acidification stress.
            Dissolved Oxygen: Below 4.0 mg/L can cause hypoxia leading to coral death.
            Turbidity: Above 3.0 NTU significantly stresses corals.
            Nitrate: Above 0.3 mg/L can cause algal blooms that suffocate coral reefs.
          
        
      
    
  );
}

