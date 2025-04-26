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
  const [summary, setSummary] = useState<string | null>(null);
  const [improvements, setImprovements] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuitable, setIsSuitable] = useState<boolean | null>(null);

  const analyzeData = async () => {
    setIsLoading(true);
    setSummary(null);
    setImprovements(null);
    setIsSuitable(null);

    try {
      const dataSummaryResult = await generateDataSummary({sensorData});
      setSummary(dataSummaryResult.summary);

      // Basic logic to determine suitability based on the summary.
      // Adjust this logic based on your specific requirements.
      const isThreatening = dataSummaryResult.summary.toLowerCase().includes('threatening');
      setIsSuitable(!isThreatening);

      if (isThreatening) {
        const improvementsResult = await suggestImprovements({
          sensorData,
          threateningFactors: dataSummaryResult.summary,
        });
        setImprovements(improvementsResult.suggestedActions);
      }
    } catch (error: any) {
      console.error('Error analyzing data:', error);
      setSummary(`Error analyzing data: ${error.message}`);
      setIsSuitable(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-start min-h-screen py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-3xl w-full space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">CoralSafe: Sensor Data Analyzer</CardTitle>
            <CardDescription>
              Upload sensor data to analyze the suitability of the marine environment for coral growth.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Enter sensor data (e.g., CSV format)"
              rows={4}
              value={sensorData}
              onChange={(e) => setSensorData(e.target.value)}
            />
            <Button onClick={analyzeData} disabled={isLoading} className="w-full">
              {isLoading ? 'Analyzing...' : 'Analyze Data'}
            </Button>
          </CardContent>
        </Card>

        {summary && (
          <Card>
            <CardHeader>
              <CardTitle>Analysis Result</CardTitle>
              <CardDescription>Here's the analysis of the provided sensor data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>Suitability</AlertTitle>
                <AlertDescription>
                  {isSuitable === null ? (
                    'Analyzing...'
                  ) : isSuitable ? (
                    <Badge variant="outline" className="bg-green-500 text-white">Suitable</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-500 text-white">Threatening</Badge>
                  )}
                </AlertDescription>
              </Alert>

              <div>
                <h3 className="text-lg font-semibold">Summary:</h3>
                <p>{summary}</p>
              </div>

              {improvements && (
                <div>
                  <h3 className="text-lg font-semibold">Suggested Improvements:</h3>
                  <p>{improvements}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
