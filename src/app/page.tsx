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
  const [overallSuitability, setOverallSuitability] = useState<boolean | null>(null);

  const parseData = (data: string) => {
    // Splitting by newline to separate entries
    return data.split('\n').map(entry => {
      const parts = entry.split(',').map(item => item.trim());
      if (parts.length < 3) {
        return null; // Skip incomplete entries
      }
      const [location, time, ...sensorValues] = parts;
      if (!location || !time || sensorValues.length === 0) {
        return null; // Skip entries with missing data
      }
      return {
        location,
        time,
        sensorValues: sensorValues.join(','), // Joining sensor values in case they contain commas
      };
    }).filter(parsed => parsed !== null) as {location: string, time: string, sensorValues: string}[]; // Filtering out null entries
  };

  const analyzeData = async () => {
    setIsLoading(true);
    setAnalysisResults([]);
    setOverallSuitability(null);

    const parsedData = parseData(sensorData);

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
          return {
            location: item.location,
            time: item.time,
            data: item.sensorValues,
            summary: `Error analyzing data: ${error.message}`,
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
              Use a comma-separated format: location, time, sensor data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Location, Time, Sensor Data (e.g., Reef1, 08:00, 28C, 8.2pH, 35ppt)"
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
                    <TableHead>Sensor Data</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Suitability</TableHead>
                    <TableHead>Improvements</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysisResults.map((result, index) => (
                    <TableRow key={index}>
                      <TableCell>{result.time}</TableCell>
                      <TableCell>{result.data}</TableCell>
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
