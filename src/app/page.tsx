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

interface AnalysisResult {
  location: string;
  time: string;
  data: string;
  summary: string | null;
  improvements: string | null;
  isSuitable: boolean | null;
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
      const [location, time, ...sensorValues] = entry.split(',').map(item => item.trim());
      return {
        location,
        time,
        sensorValues: sensorValues.join(','), // Joining sensor values in case they contain commas
      };
    }).filter(parsed => parsed.location && parsed.time && parsed.sensorValues); // Filtering out incomplete entries
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
          const isThreatening = dataSummaryResult.summary.toLowerCase().includes('threatening');
          const isSuitable = !isThreatening;
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
    const allSuitable = results.every(result => result.isSuitable === true);
    setOverallSuitability(allSuitable);

    setIsLoading(false);
  };

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
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
