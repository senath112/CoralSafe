'use client';

import {useState, useEffect} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {defineSensorDataThresholds, analyzeSensorData} from '@/lib/utils';
import {ChartContainer} from '@/components/Chart';
import {Progress} from "@/components/ui/progress";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import * as tf from '@tensorflow/tfjs';
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {Badge} from "@/components/ui/badge";

import {cn} from "@/lib/utils";

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
  summary: string;
  improvements: string;
  temperatureColor: string;
  salinityColor: string;
  phColor: string;
  oxygenColor: string;
  turbidityColor: string;
  nitrateColor: string;
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

const Home = () => {
  const [sensorData, setSensorData] = useState('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [model, setModel] = useState<tf.Sequential | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Define color-coded thresholds for each parameter
  const thresholds = defineSensorDataThresholds();

  useEffect(() => {
    // Load TensorFlow.js only on the client-side
    import('@tensorflow/tfjs')
      .then(tf => {
        console.log('TensorFlow.js loaded successfully.');
      })
      .catch(err => {
        console.error('Failed to load TensorFlow.js:', err);
        setError('Failed to load TensorFlow.js. Please check your network connection.');
      });
  }, []);

  const trainModel = async (data: SensorData[]) => {
    if (!tf) {
      console.error('TensorFlow.js is not available.');
      setError('TensorFlow.js is not available. Please try again.');
      return null;
    }

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

  const parseData = (data: string) => {
    return data.split('\n').slice(1).map(entry => {
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length < 8) {
        return null;
      }

      const [time, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;

      if (!time || !location || !waterTemperature || !salinity || !pHLevel || !dissolvedOxygen || !turbidity || !nitrate) {
        return null;
      }

      return {
        time,
        location,
        waterTemperature: parseFloat(waterTemperature),
        salinity: parseFloat(salinity),
        pHLevel: parseFloat(pHLevel),
        dissolvedOxygen: parseFloat(dissolvedOxygen),
        turbidity: parseFloat(turbidity),
        nitrate: parseFloat(nitrate),
      };
    }).filter(Boolean) as SensorData[];
  };

  const handleAnalyze = async () => {
    setError(null);
    setLoading(true);
    setProgress(0);
    setAnalysisResults([]);

    try {
      const parsedData = parseData(sensorData);
      if (!parsedData || parsedData.length === 0) {
        setError('No valid data found. Please check your input format.');
        setLoading(false);
        return;
      }

      const trainedModel = await trainModel(parsedData);
      if (!trainedModel) {
        setError('Failed to train the model.');
        setLoading(false);
        return;
      }
      setModel(trainedModel);

      const newResults: AnalysisResult[] = [];
      let allChartData = [...newResults];

      for (let i = 0; i < parsedData.length; i++) {
        const data = parsedData[i];
        const {isSuitable, summary, temperatureColor, salinityColor, phColor, oxygenColor, turbidityColor, nitrateColor, improvements} = analyzeSensorData(data, thresholds);

        const analysisResult: AnalysisResult = {
          time: data.time,
          location: data.location,
          waterTemperature: data.waterTemperature,
          salinity: data.salinity,
          pHLevel: data.pHLevel,
          dissolvedOxygen: data.dissolvedOxygen,
          turbidity: data.turbidity,
          nitrate: data.nitrate,
          isSuitable,
          summary,
          improvements,
          temperatureColor,
          salinityColor,
          phColor,
          oxygenColor,
          turbidityColor,
          nitrateColor,
        };
        newResults.push(analysisResult);
        allChartData.push(analysisResult);

        setProgress((i + 1) / parsedData.length * 100);
        await new Promise(resolve => setTimeout(resolve, 10)); // brief pause
      }
      setAnalysisResults(newResults);

      // Predict future data points using TensorFlow.js model
      if (trainedModel && parsedData.length > 0) {
        const numPredictions = 5;

        let previousRecord = parsedData[parsedData.length - 1];

        for (let i = 0; i < numPredictions; i++) {
          // Prepare the input tensor using the last record's data
          const inputTensor = tf.tensor2d(
            [
              [
                previousRecord.waterTemperature,
                previousRecord.salinity,
                previousRecord.pHLevel,
                previousRecord.dissolvedOxygen,
                previousRecord.turbidity,
                previousRecord.nitrate,
              ],
            ],
            [1, 6]
          );

          // Generate predictions
          const predictions = trainedModel.predict(inputTensor) as tf.Tensor<tf.Rank.R2>;
          const predictedValues = await predictions.data();

          // Adding slight variations to the predicted values
          const predictedWaterTemperature = predictedValues[0] + (Math.random() - 0.5) * 0.1;
          const predictedSalinity = predictedValues[1] + (Math.random() - 0.5) * 0.1;
          const predictedPHLevel = predictedValues[2] + (Math.random() - 0.5) * 0.01;
          const predictedDissolvedOxygen = predictedValues[3] + (Math.random() - 0.5) * 0.1;
          const predictedTurbidity = predictedValues[4] + (Math.random() - 0.5) * 0.05;
          const predictedNitrate = predictedValues[5] + (Math.random() - 0.5) * 0.01;

          const predictionTime = `P${i + 1}`;
          const predictedData: SensorData = {
            time: predictionTime,
            location: "Prediction",
            waterTemperature: predictedWaterTemperature,
            salinity: predictedSalinity,
            pHLevel: predictedPHLevel,
            dissolvedOxygen: predictedDissolvedOxygen,
            turbidity: predictedTurbidity,
            nitrate: predictedNitrate,
          };

          const {isSuitable: predictedIsSuitable, summary: predictedSummary, temperatureColor: predictedTemperatureColor, salinityColor: predictedSalinityColor, phColor: predictedPhColor, oxygenColor: predictedOxygenColor, turbidityColor: predictedTurbidityColor, nitrateColor: predictedNitrateColor, improvements: predictedImprovements} = analyzeSensorData(predictedData, thresholds);

          const predictedAnalysisResult: AnalysisResult = {
            time: predictedData.time,
            location: predictedData.location,
            waterTemperature: predictedData.waterTemperature,
            salinity: predictedData.salinity,
            pHLevel: predictedData.pHLevel,
            dissolvedOxygen: predictedData.dissolvedOxygen,
            turbidity: predictedData.turbidity,
            nitrate: predictedData.nitrate,
            isSuitable: predictedIsSuitable,
            summary: predictedSummary,
            improvements: predictedImprovements,
            temperatureColor: predictedTemperatureColor,
            salinityColor: predictedSalinityColor,
            phColor: predictedPhColor,
            oxygenColor: predictedOxygenColor,
            turbidityColor: predictedTurbidityColor,
            nitrateColor: predictedNitrateColor,
          };

          allChartData.push(predictedAnalysisResult);
          previousRecord = predictedData;
        }
        setAnalysisResults(allChartData);
      }
    } catch (e: any) {
      console.error("Analysis failed:", e);
      setError(`Analysis failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const bubbles = Array.from({length: 20}, (_, i) => ({
    id: i,
    size: Math.random() * 30 + 10,
    left: Math.random() * 100 + '%',
    animationDuration: Math.random() * 5 + 5 + 's',
  }));

  const fishImages = [
    '/fish.png',
  ];

  const fishes = Array.from({length: 5}, (_, i) => ({
    id: i,
    width: Math.random() * 30 + 20,
    height: Math.random() * 15 + 10,
    left: Math.random() * 100 + '%',
    top: Math.random() * 80 + 10 + '%',
    animationDuration: Math.random() * 5 + 5 + 's',
    animationDirection: i % 2 === 0 ? 'normal' : 'reverse',
    src: fishImages[Math.floor(Math.random() * fishImages.length)],
  }));

  return (
    
      {/* Bubbles */}
      
        {bubbles.map((bubble) => (
          
        ))}
      
      {/* Animated Fish */}
      
        {fishes.map((fish) => (
          
            <img
              key={fish.id}
              src={fish.src}
              alt="Fish"
              style={{
                width: fish.width + 'px',
                height: fish.height + 'px',
                left: fish.left,
                top: fish.top,
                animationDuration: fish.animationDuration,
                animationDirection: fish.animationDirection,
                objectFit: 'contain',
                transform: 'scaleX(-1)',
              }}
            />
          
        ))}
      

      
        
          
            
              CoralSafe: Sensor Data Analyzer
            
          
        
        
          Enter sensor data for a reef location over multiple times, separated by newlines.
          
            Format: Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L
          
          
            <Textarea
              placeholder="Paste sensor data here"
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
            />
          
        
        
          
            Analyze Data
          
        

        {error && (
          
            
              
                
                  Error
                
              
              
                {error}
              
            
          
        )}

        {loading && (
          
            Analyzing Data:
            
              
            
            {progress.toFixed(1)}%
          
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
                
                
                  Improvements
                
              
            
            
              {analysisResults.map((result, index) => (
                
                  
                    
                      {result.time}
                    
                  
                  
                    
                      {result.location}
                    
                  
                  
                    
                      {result.isSuitable === null ? (
                        
                          
                            Not Available
                          
                      ) : result.isSuitable ? (
                        
                          Suitable
                        
                      ) : (
                        
                          Threatening
                        
                      )}
                    
                  
                  
                    
                      {result.waterTemperature}
                    
                  
                  
                    
                      {result.salinity}
                    
                  
                  
                    
                      {result.pHLevel}
                    
                  
                  
                    
                      {result.dissolvedOxygen}
                    
                  
                  
                    
                      {result.turbidity}
                    
                  
                  
                    
                      {result.nitrate}
                    
                  
                  
                    
                      
                        {result.summary}
                      
                    
                  
                  
                    
                      
                        
                          
                            
                              
                            
                            {result.improvements}
                          
                        
                      
                    
                  
                
              ))}
            
          
        )}

        
          {['waterTemperature', 'salinity', 'pHLevel', 'dissolvedOxygen', 'turbidity', 'nitrate'].map(name => (
            
              
                
                  {name} Over Time
                
              
              
                Trends of {name} over time, including predictions.
              
            
            
              {analysisResults.length > 0 ? (
                <ChartContainer
                  config={{
                    "waterTemperature": {label: "Water Temperature (°C)"},
                    "salinity": {label: "Salinity (PSU)"},
                    "pHLevel": {label: "pH Level"},
                    "dissolvedOxygen": {label: "Dissolved Oxygen (mg/L)"},
                    "turbidity": {label: "Turbidity (NTU)"},
                    "nitrate": {label: "Nitrate (mg/L)"},
                  }}
                >
                  
                    
                      
                        
                          key={index}
                          dataKey="time"
                          name="Time"
                        
                      
                      
                        
                          key="waterTemperature"
                          type="monotone"
                          dataKey="waterTemperature"
                          stroke="#8884d8"
                          name="Water Temperature"
                        
                      
                    
                  
                </ChartContainer>
              ) : (
                
                  No data to display. Please analyze sensor data.
                
              )}
            
          ))}
        
      
    
  );
};

export default Home;
