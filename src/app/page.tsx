'use client';

import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from '@/components/ui/card';
import {generateDataSummary} from '@/ai/flows/generate-data-summary';
import {suggestImprovements} from '@/ai/flows/suggest-improvements';
import {Alert, AlertDescription, AlertTitle} from '@/components/ui/alert';
import {Info} from 'lucide-react';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';

export default function Home() {
  const [sensorData, setSensorData] = useState('');
  const [analysisResults, setAnalysisResults] = useState<
    {data: string; summary: string | null; improvements: string | null; isSuitable: boolean | null}[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const analyzeData = async () => {
    setIsLoading(true);
    setAnalysisResults([]);

    // Split the input into individual data entries, assuming each entry is separated by a newline
    const dataEntries = sensorData.split('\n').filter(entry => entry.trim() !== '');

    const results = await Promise.all(
      dataEntries.map(async (data) => {
        try {
          const dataSummaryResult = await generateDataSummary({sensorData: data});
          const isThreatening = dataSummaryResult.summary.toLowerCase().includes('threatening');
          const isSuitable = !isThreatening;
          let improvements = null;

          if (isThreatening) {
            const improvementsResult = await suggestImprovements({
              sensorData: data,
              threateningFactors: dataSummaryResult.summary,
            });
            improvements = improvementsResult.suggestedActions;
          }

          return {
            data: data,
            summary: dataSummaryResult.summary,
            improvements: improvements,
            isSuitable: isSuitable,
          };
        } catch (error: any) {
          console.error('Error analyzing data:', error);
          return {
            data: data,
            summary: `Error analyzing data: ${error.message}`,
            improvements: null,
            isSuitable: null,
          };
        }
      })
    );

    setAnalysisResults(results);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-3xl w-full space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">CoralSafe: Sensor Data Analyzer</CardTitle>
            <CardDescription>
              Enter sensor data for multiple reef locations, separated by newlines, to analyze coral growth
              suitability.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter sensor data (e.g., CSV format), separate each entry with a new line"
              rows={4}
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
            />
            <Button onClick={analyzeData} disabled={isLoading} className="w-full">
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
          </CardContent>
        </Card>

        {analysisResults.length > 0 &&
          analysisResults.map((result, index) => (
            <Card key={index} className="mb-4">
              <CardHeader>
                <CardTitle>Analysis Result for Reef Location {index + 1}</CardTitle>
                <CardDescription>Analysis of the provided sensor data.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Suitability</AlertTitle>
                  <AlertDescription>
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
                  </AlertDescription>
                </Alert>

                <div>
                  <h3 className="text-lg font-semibold">Summary:</h3>
                  <p>{result.summary}</p>
                </div>

                {result.improvements && (
                  <div>
                    <h3 className="text-lg font-semibold">Suggested Improvements:</h3>
                    <p>{result.improvements}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
