'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {generateDataSummary} from '@/ai/flows/generate-data-summary';
import {suggestImprovements} from '@/ai/flows/suggest-improvements';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';
import {Input} from '@/components/ui/input';
import {Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {
  Chart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Alert, AlertDescription, AlertTitle} from "@/components/ui/alert";
import {Progress} from "@/components/ui/progress";

interface AnalysisResult {
  location: string;
  time: string;
  data: string;
  summary: string | null;
  improvements: string | null;
  isSuitable: boolean | null;
}

interface ChartData {
  time: string;
  suitability: number | null;
}

export default function Home() {
  const [sensorData, setSensorData] = useState('');
  const [threshold, setThreshold] = useState(10); // Default threshold value
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [overallSuitability, setOverallSuitability] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parseData = (data: string) => {
    // Splitting by newline to separate entries
    return data.split('\n').slice(1).map(entry => { // Skip the header row
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length < 8) {
        return null; // Skip incomplete entries
      }
      const [time, location, waterTemperature, salinity, pHLevel, dissolvedOxygen, turbidity, nitrate] = parts;
      if (!location || !time || !waterTemperature || !salinity || !pHLevel || !dissolvedOxygen || !turbidity || !nitrate) {
        return null; // Skip entries with missing data
      }
      return {
        location,
        time,
        waterTemperature,
        salinity,
        pHLevel,
        dissolvedOxygen,
        turbidity,
        nitrate,
        sensorValues: `${waterTemperature}, ${salinity}, ${pHLevel}, ${dissolvedOxygen}, ${turbidity}, ${nitrate}`,
      };
    }).filter(parsed => parsed !== null) as {
      location: string;
      time: string;
      waterTemperature: string;
      salinity: string;
      pHLevel: string;
      dissolvedOxygen: string;
      turbidity: string;
      nitrate: string;
      sensorValues: string;
    }[]; // Filtering out null entries
  };

  const analyzeData = async () => {
    setIsLoading(true);
    setProgress(0);
    setAnalysisResults([]);
    setOverallSuitability(null);
    setErrorMessage(null);

    const parsedData = parseData(sensorData);
    const totalEntries = parsedData.length;
    let completedEntries = 0;

    const results = await Promise.all(
      parsedData.map(async (item) => {
        try {
          const dataSummaryResult = await generateDataSummary({sensorData: item.sensorValues});
          const isThreatening = !dataSummaryResult.isSuitable;
          const isSuitable = dataSummaryResult.isSuitable;
          let improvements = null;

          if (isThreatening) {
            const improvementsResult = await suggestImprovements({
              sensorData: item.sensorValues,
              threateningFactors: dataSummaryResult.summary,
            });
            improvements = improvementsResult.suggestedActions;
          }

          completedEntries++;
          setProgress((completedEntries / totalEntries) * 100);

          return {
            location: item.location,
            time: item.time,
            data: item.sensorValues,
            summary: dataSummaryResult.summary,
            improvements: improvements,
            isSuitable: isSuitable,
          };
        } catch (error: any) {
          console.error('Error analyzing data:', error);
          let message = 'An unexpected error occurred.';
          if (error.message.includes('429 Too Many Requests')) {
            message = 'Too many requests. Please try again after some time.';
          } else {
            message = `Error analyzing data: ${error.message}`;
          }
          setErrorMessage(message); // Set the error message state
          return {
            location: item.location,
            time: item.time,
            data: item.sensorValues,
            summary: message,
            improvements: null,
            isSuitable: null,
          };
        }
      })
    );

    setAnalysisResults(results);

    // Determine overall suitability
    const allSuitable = results.every(result => result.isSuitable === true || result.isSuitable === null);
    setOverallSuitability(allSuitable);

    setIsLoading(false);
    setProgress(100);
  };

  const chartData: ChartData[] = analysisResults.map(result => ({
    time: result.time,
    suitability: result.isSuitable === null ? null : result.isSuitable ? 1 : 0,
  }));

  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-5xl w-full space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">CoralSafe: Sensor Data Analyzer</CardTitle>
            <CardDescription>
              Enter sensor data for a reef location over multiple times, separated by newlines.
              Use a comma-separated format: Date, Location, Water_Temperature_C, Salinity_PSU, pH_Level, Dissolved_Oxygen_mg_L, Turbidity_NTU, Nitrate_mg_L.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Date, Location, Water_Temperature_C, Salinity_PSU, pH_Level, Dissolved_Oxygen_mg_L, Turbidity_NTU, Nitrate_mg_L (e.g., 2024-07-24, Reef1, 28, 35, 8.2, 7, 2, 0.5)"
              rows={4}
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
            />
            <div className="flex items-center space-x-4">
              <Input
                type="number"
                placeholder="Threshold"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-24"
              />
              <p>Set threshold for suitability analysis</p>
            </div>
            <Button onClick={analyzeData} disabled={isLoading} className="w-full">
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
            {isLoading && (
              <Progress value={progress} className="w-full" />
            )}
            {errorMessage && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {analysisResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>Detailed analysis of sensor data for the location over time.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Water Temperature</TableHead>
                    <TableHead>Salinity</TableHead>
                    <TableHead>pH Level</TableHead>
                    <TableHead>Dissolved Oxygen</TableHead>
                    <TableHead>Turbidity</TableHead>
                    <TableHead>Nitrate</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Suitability</TableHead>
                    <TableHead>Improvements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{result.time}</TableCell>
                      <TableCell>{result.location}</TableCell>
                      <TableCell>{result.data.split(',')[0]}</TableCell>
                      <TableCell>{result.data.split(',')[1]}</TableCell>
                      <TableCell>{result.data.split(',')[2]}</TableCell>
                      <TableCell>{result.data.split(',')[3]}</TableCell>
                      <TableCell>{result.data.split(',')[4]}</TableCell>
                      <TableCell>{result.data.split(',')[5]}</TableCell>
                      <TableCell>{result.summary}</TableCell>
                      <TableCell>
                        {result.isSuitable === null ? (
                          'Analyzing...'
                        ) : result.isSuitable ? (
                          <Badge variant="outline" className="bg-green-500 text-white">
                            Suitable
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500 text-white">
                            Threatening
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{result.improvements || 'N/A'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {overallSuitability !== null && (
                <div className="mt-4">
                  <h3 className="text-lg font-semibold">Overall Suitability:</h3>
                  {overallSuitability ? (
                    <Badge variant="outline" className="bg-green-500 text-white">Suitable</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500 text-white">Threatening</Badge>
                  )}
                </div>
              )}
              <div className="mt-6">
                <h3 className="text-lg font-semibold">Suitability Over Time</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="time" />
                    <YAxis domain={[0, 1]} ticks={[0, 1]} tickFormatter={(tick) => (tick === 1 ? 'Suitable' : 'Threatening')} />
                    <Tooltip />
                    <Line type="monotone" dataKey="suitability" stroke="#8884d8" name="Suitability" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
