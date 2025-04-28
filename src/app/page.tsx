'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Progress} from "@/components/ui/progress";
import {Accordion, AccordionContent, AccordionItem, AccordionTrigger} from "@/components/ui/accordion";
import Image from 'next/image';
import * as tf from '@tensorflow/tfjs';
import {
  Chart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Brush,
  Legend,
} from 'recharts';
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

interface AnalysisResult {
  location: string;
  time: string;
  waterTemperature: string;
  salinity: string;
  pHLevel: string;
  dissolvedOxygen: string;
  turbidity: string;
  nitrate: string;
  summary: string | null;
  improvements: string | null;
  isSuitable: boolean | null;
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

interface ChartData {
  time: string;
  waterTemperature: number | null;
  salinity: number | null;
  pHLevel: number | null;
  dissolvedOxygen: number | null;
  turbidity: number | null;
  nitrate: number | null;
  isPrediction?: boolean;
}

// Define thresholds for environmental parameters
const thresholds = {
  temperatureIdeal: [24, 28],
  temperatureCaution: [28, 30],
  salinityIdeal: [33, 36],
  salinityCaution: [31, 33, 36, 38],
  pHIdeal: [8.0, 8.3],
  pHCaution: [7.8, 8.0],
  oxygenIdeal: 6.0,
  oxygenCaution: [4.0, 6.0],
  turbidityIdeal: 1.0,
  turbidityCaution: [1.0, 3.0],
  nitrateIdeal: 0.1,
  nitrateCaution: [0.1, 0.3],
};

const analyzeSensorData = (data: SensorData): { isSuitable: boolean, summary: string } => {
  const {waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate} = data;
  let summary = '';
  let isSuitable = true;

  if (waterTemperature < thresholds.temperatureIdeal[0] || waterTemperature > thresholds.temperatureIdeal[1]) {
    isSuitable = false;
    summary += `Temperature is outside the ideal range (${thresholds.temperatureIdeal[0]}°C - ${thresholds.temperatureIdeal[1]}°C). `;
  }
  if (salinity < thresholds.salinityIdeal[0] || salinity > thresholds.salinityIdeal[1]) {
    isSuitable = false;
    summary += `Salinity is outside the ideal range (${thresholds.salinityIdeal[0]} PSU - ${thresholds.salinityIdeal[1]} PSU). `;
  }
  if (pHLevel < thresholds.pHIdeal[0] || pHLevel > thresholds.pHIdeal[1]) {
    isSuitable = false;
    summary += `pH level is outside the ideal range (${thresholds.pHIdeal[0]} - ${thresholds.pHIdeal[1]}). `;
  }
  if (dissolvedOxygen < thresholds.oxygenIdeal) {
    isSuitable = false;
    summary += `Dissolved oxygen is below the ideal level (${thresholds.oxygenIdeal} mg/L). `;
  }
  if (turbidity > thresholds.turbidityIdeal) {
    isSuitable = false;
    summary += `Turbidity is above the ideal level (${thresholds.turbidityIdeal} NTU). `;
  }
  if (nitrate > thresholds.nitrateIdeal) {
    isSuitable = false;
    summary += `Nitrate concentration is above the ideal level (${thresholds.nitrateIdeal} mg/L). `;
  }

  if (summary === '') {
    summary = 'All parameters are within the ideal ranges.';
  }

  return {isSuitable, summary};
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

export default function Home() {
  const [sensorData, setSensorData] = useState('');
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [overallSuitability, setOverallSuitability] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [allChartData, setAllChartData] = useState<ChartData[]>([]);
  const [temperatureChartData, setTemperatureChartData] = useState<ChartData[]>([]);
  const [salinityChartData, setSalinityChartData] = useState<ChartData[]>([]);
  const [pHChartData, setPHChartData] = useState<ChartData[]>([]);
  const [oxygenChartData, setOxygenChartData] = useState<ChartData[]>([]);
  const [turbidityChartData, setTurbidityChartData] = useState<ChartData[]>([]);
  const [nitrateChartData, setNitrateChartData] = useState<ChartData[]>([]);

  const parseData = (data: string): SensorData[] => {
    return data.split('\n')
      .slice(1)
      .map(entry => {
        const parts = entry.split(',').map(item => item.trim());
        if (parts.length !== 8) {
          return null;
        }
        const [time, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;
        if (!location || !time || !waterTemperature || !salinity || !pHLevel || !dissolvedOxygen || !turbidity || !nitrate) {
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
      })
      .filter(parsed => parsed !== null) as SensorData[];
  };

  const analyzeData = async () => {
    setIsLoading(true);
    setProgress(0);
    setAnalysisResults([]);
    setOverallSuitability(null);
    setErrorMessage(null);
    setAllChartData([]);
    setTemperatureChartData([]);
    setSalinityChartData([]);
    setPHChartData([]);
    setOxygenChartData([]);
    setTurbidityChartData([]);
    setNitrateChartData([]);

    const parsedData = parseData(sensorData);
    const totalEntries = parsedData.length;
    let completedEntries = 0;

    try {
      const model = await trainModel(parsedData);

      const results = parsedData.map((item) => {
        const {isSuitable, summary} = analyzeSensorData(item);
        completedEntries++;
        setProgress((completedEntries / totalEntries) * 100);

        return {
          location: item.location,
          time: item.time,
          waterTemperature: item.waterTemperature.toString(),
          salinity: item.salinity.toString(),
          pHLevel: item.pHLevel.toString(),
          dissolvedOxygen: item.dissolvedOxygen.toString(),
          turbidity: item.turbidity.toString(),
          nitrate: item.nitrate.toString(),
          summary: summary,
          improvements: null, // Since GenAI is removed
          isSuitable: isSuitable,
        };
      });

      setAnalysisResults(results);

      // Determine overall suitability
      const allSuitable = results.every(result => result.isSuitable === true);
      setOverallSuitability(allSuitable);

      // Prepare initial chart data
      const initialChartData = parsedData.map(result => ({
        time: result.time,
        waterTemperature: result.waterTemperature,
        salinity: result.salinity,
        pHLevel: result.pHLevel,
        dissolvedOxygen: result.dissolvedOxygen,
        turbidity: result.turbidity,
        nitrate: result.nitrate,
      }));

      // Limit initial data to the latest 95 records to accommodate 5 prediction points
      const limitedInitialChartData = initialChartData.slice(Math.max(initialChartData.length - 95, 0));

      // Predict future data points using TensorFlow.js model
      if (model && parsedData.length > 0) {
        const numPredictions = 5;
        const predictedChartData: ChartData[] = [];
        let previousRecord: SensorData = parsedData[parsedData.length - 1]; // Start with the last actual record
  
        for (let i = 0; i < numPredictions; i++) {
          // Prepare the input tensor using the last available record
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
          const predictions = model.predict(inputTensor) as tf.Tensor<tf.Rank.R2>;
          const predictedValues = await predictions.data();
  
          // Create a new predicted record
          const predictionTime = `P${i + 1}`;
          const newRecord: SensorData = {
            time: predictionTime,
            location: previousRecord.location, // Assume location remains the same
            waterTemperature: predictedValues[0],
            salinity: predictedValues[1],
            pHLevel: predictedValues[2],
            dissolvedOxygen: predictedValues[3],
            turbidity: predictedValues[4],
            nitrate: predictedValues[5],
          };
  
          predictedChartData.push({
            time: predictionTime,
            waterTemperature: predictedValues[0],
            salinity: predictedValues[1],
            pHLevel: predictedValues[2],
            dissolvedOxygen: predictedValues[3],
            turbidity: predictedValues[4],
            nitrate: predictedValues[5],
            isPrediction: true, // Mark as prediction
          });
  
          previousRecord = newRecord; // Use the new predicted record for the next prediction
        }

        // Combine historical data with predicted data for overall chart
        const combinedChartData = [...limitedInitialChartData, ...predictedChartData];
        setAllChartData(combinedChartData.slice(-100));

        // Prepare data for individual charts
        const temperatureData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.waterTemperature})),
          ...predictedChartData.map(item => ({time: item.time, value: item.waterTemperature, isPrediction: true}))];
        setTemperatureChartData(temperatureData.slice(-100));

        const salinityData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.salinity})),
          ...predictedChartData.map(item => ({time: item.time, value: item.salinity, isPrediction: true}))];
        setSalinityChartData(salinityData.slice(-100));

        const pHData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.pHLevel})),
          ...predictedChartData.map(item => ({time: item.time, value: item.pHLevel, isPrediction: true}))];
        setPHChartData(pHData.slice(-100));

        const oxygenData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.dissolvedOxygen})),
          ...predictedChartData.map(item => ({time: item.time, value: item.dissolvedOxygen, isPrediction: true}))];
        setOxygenChartData(oxygenData.slice(-100));

        const turbidityData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.turbidity})),
          ...predictedChartData.map(item => ({time: item.time, value: item.turbidity, isPrediction: true}))];
        setTurbidityChartData(turbidityData.slice(-100));

        const nitrateData = [...limitedInitialChartData.map(item => ({time: item.time, value: item.nitrate})),
          ...predictedChartData.map(item => ({time: item.time, value: item.nitrate, isPrediction: true}))];
        setNitrateChartData(nitrateData.slice(-100));
      }
    } catch (error: any) {
      console.error('Error analyzing data:', error);
      setErrorMessage('Failed to analyze data. Please check the input format and try again.');
    } finally {
      setIsLoading(false);
      setProgress(100);
    }
  };

  const getParameterColor = (parameter: string, value: number): string => {
    switch (parameter) {
      case 'waterTemperature':
        if (value >= thresholds.temperatureIdeal[0] && value <= thresholds.temperatureIdeal[1]) {
          return 'green';
        } else if (value >= thresholds.temperatureCaution[0] && value <= thresholds.temperatureCaution[1]) {
          return 'yellow';
        } else {
          return 'red';
        }
      case 'salinity':
        if (value >= thresholds.salinityIdeal[0] && value <= thresholds.salinityIdeal[1]) {
          return 'green';
        } else if (
          (value >= thresholds.salinityCaution[0] && value <= thresholds.salinityCaution[1]) ||
          (value >= thresholds.salinityCaution[2] && value <= thresholds.salinityCaution[3])
        ) {
          return 'yellow';
        } else {
          return 'red';
        }
      case 'pHLevel':
        if (value >= thresholds.pHIdeal[0] && value <= thresholds.pHIdeal[1]) {
          return 'green';
        } else if (value >= thresholds.pHCaution[0] && value <= thresholds.pHCaution[1]) {
          return 'yellow';
        } else {
          return 'red';
        }
      case 'dissolvedOxygen':
        if (value > thresholds.oxygenIdeal) {
          return 'green';
        } else if (value >= thresholds.oxygenCaution[0] && value <= thresholds.oxygenCaution[1]) {
          return 'yellow';
        } else {
          return 'red';
        }
      case 'turbidity':
        if (value <= thresholds.turbidityIdeal) {
          return 'green';
        } else if (value >= thresholds.turbidityCaution[0] && value <= thresholds.turbidityCaution[1]) {
          return 'yellow';
        } else {
          return 'red';
        }
      case 'nitrate':
        if (value <= thresholds.nitrateIdeal) {
          return 'green';
        } else if (value >= thresholds.nitrateCaution[0] && value <= thresholds.nitrateCaution[1]) {
          return 'yellow';
        } else {
          return 'red';
        }
      default:
        return 'black';
    }
  };

  const renderChart = (data: any[], dataKey: string, name: string, strokeColor: string) => (
    <Card>
      <CardHeader>
        <CardTitle>{name} Over Time</CardTitle>
        <CardDescription>Trends of {name} over time, including predictions.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" stroke={strokeColor} name={name} />
            <Brush dataKey="time" stroke={strokeColor} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-5xl w-full space-y-8">
        <Card className="bg-card shadow-md rounded-md">
          <CardHeader>
            <CardTitle>
              <div className="flex items-center">
                <Image
                  src="https://picsum.photos/40/40"
                  alt="CoralSafe Logo"
                  width={40}
                  height={40}
                  className="mr-2 rounded-full"
                />
                <span className="text-lg font-semibold">CoralSafe: Sensor Data Analyzer</span>
              </div>
            </CardTitle>
            <CardDescription>
              Enter sensor data for a reef location over multiple times, separated by newlines.
              Use a comma-separated format: Date,Location,Water_Temperature_C,Salinity_PSU,pH_Level,Dissolved_Oxygen_mg_L,Turbidity_NTU,Nitrate_mg_L.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              Sensor Data Input
            </div>
            <Textarea
              placeholder="Paste sensor data here"
              rows={4}
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
              className="shadow-sm rounded-md"
            />
            <Button onClick={analyzeData} disabled={isLoading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 mt-4 rounded-md">
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
            {isLoading && (
              <Progress value={progress} className="w-full mt-2" />
            )}
            {errorMessage && (
              <Alert variant="destructive" className="mt-4 rounded-md">
                <AlertTitle>Error</AlertTitle>
                {errorMessage}
              </Alert>
            )}
          </CardContent>
        </Card>

        {analysisResults.length > 0 && (
          <Card className="shadow-md rounded-md">
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>Detailed analysis of sensor data for the location over time.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table className="rounded-md shadow-md">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left font-medium py-2">Time</TableHead>
                    <TableHead className="text-left font-medium py-2">Location</TableHead>
                    <TableHead className="text-left font-medium py-2">Suitability</TableHead>
                    <TableHead className="text-left font-medium py-2">Water Temperature</TableHead>
                    <TableHead className="text-left font-medium py-2">Salinity</TableHead>
                    <TableHead className="text-left font-medium py-2">pH Level</TableHead>
                    <TableHead className="text-left font-medium py-2">Dissolved Oxygen</TableHead>
                    <TableHead className="text-left font-medium py-2">Turbidity</TableHead>
                    <TableHead className="text-left font-medium py-2">Nitrate</TableHead>
                    <TableHead className="text-left font-medium py-2">Summary</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell className="py-2">{result.time}</TableCell>
                      <TableCell className="py-2">{result.location}</TableCell>
                       <TableCell className="py-2">
                        {result.isSuitable === null ? (
                          'Analyzing...'
                        ) : result.isSuitable ? (
                          <Badge variant="outline" style={{ backgroundColor: 'green', color: 'white' }} className="rounded-md">
                            Suitable
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="rounded-md">
                            Threatening
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('waterTemperature', parseFloat(result.waterTemperature)), borderRadius: '0.5rem' }}>{result.waterTemperature}</TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('salinity', parseFloat(result.salinity)), borderRadius: '0.5rem' }}>{result.salinity}</TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('pHLevel', parseFloat(result.pHLevel)), borderRadius: '0.5rem' }}>{result.pHLevel}</TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('dissolvedOxygen', parseFloat(result.dissolvedOxygen)), borderRadius: '0.5rem' }}>{result.dissolvedOxygen}</TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('turbidity', parseFloat(result.turbidity)), borderRadius: '0.5rem' }}>{result.turbidity}</TableCell>
                      <TableCell className="py-2" style={{ backgroundColor: getParameterColor('nitrate', parseFloat(result.nitrate)), borderRadius: '0.5rem' }}>{result.nitrate}</TableCell>
                       <TableCell className="py-2">
                        {result.summary ? (
                          <Accordion type="single" collapsible>
                            <AccordionItem value={`summary-${index}`}>
                              <AccordionTrigger className="text-sm font-medium">
                                View Summary
                              </AccordionTrigger>
                              <AccordionContent className="text-sm text-muted-foreground">
                                {result.summary}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        ) : (
                          'N/A'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {overallSuitability !== null && (
                <div className="mt-4">
                  Overall Suitability:
                  {overallSuitability ? (
                    <Badge variant="outline" style={{ backgroundColor: 'green', color: 'white' }} className="ml-2 rounded-md">
                      Suitable
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="ml-2 rounded-md">
                      Threatening
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {renderChart(temperatureChartData, 'waterTemperature', 'Water Temperature', '#8884d8')}
        {renderChart(salinityChartData, 'salinity', 'Salinity', '#82ca9d')}
        {renderChart(pHChartData, 'pHLevel', 'pH Level', '#ffc658')}
        {renderChart(oxygenChartData, 'dissolvedOxygen', 'Dissolved Oxygen', '#a4de6c')}
        {renderChart(turbidityChartData, 'turbidity', 'Turbidity', '#d0ed57')}
        {renderChart(nitrateChartData, 'nitrate', 'Nitrate', '#ff7300')}
              <Card className="shadow-md rounded-md">
        <CardHeader>
          <CardTitle>All Parameters Over Time</CardTitle>
          <CardDescription>Trends of all parameters over time, including predictions.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={500}>
            <LineChart data={allChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="waterTemperature" stroke="#8884d8" name="Water Temperature" />
              <Line type="monotone" dataKey="salinity" stroke="#82ca9d" name="Salinity" />
              <Line type="monotone" dataKey="pHLevel" stroke="#ffc658" name="pH Level" />
              <Line type="monotone" dataKey="dissolvedOxygen" stroke="#a4de6c" name="Dissolved Oxygen" />
              <Line type="monotone" dataKey="turbidity" stroke="#d0ed57" name="Turbidity" />
              <Line type="monotone" dataKey="nitrate" stroke="#ff7300" name="Nitrate" />
              <Brush dataKey="time" stroke="#8884d8" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
